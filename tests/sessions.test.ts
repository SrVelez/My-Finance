import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { describeDevice } from "@/lib/userAgent";

// Caso 14: "Sair de todos os outros" encerra as outras sessões e mantém a atual (Better Auth de verdade).
process.env.DATABASE_URL = "file:./vitest-sessions.db";
process.env.EMAIL_TRANSPORT = "memory";
process.env.AUTH_RATE_LIMIT = "off";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.BETTER_AUTH_SECRET = "teste-teste-teste-teste-teste-teste-123456";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => undefined, getAll: () => [], delete: () => undefined }),
}));

const ORIGIN = "http://localhost:3000";
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("14. sessões e aparelhos", () => {
  let db: typeof import("@/lib/db").db;
  let auth: typeof import("@/lib/auth/auth").auth;
  let outbox: typeof import("@/lib/auth/email").outbox;

  beforeAll(async () => {
    for (const f of ["vitest-sessions.db", "vitest-sessions.db-journal"]) rmSync(path.join(__dirname, "../prisma", f), { force: true });
    execSync("npx prisma db push --skip-generate", { stdio: "pipe", env: process.env });
    ({ db } = await import("@/lib/db"));
    ({ auth } = await import("@/lib/auth/auth"));
    ({ outbox } = await import("@/lib/auth/email"));
  }, 90_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  beforeEach(async () => {
    outbox.length = 0;
    await db.otpSend.deleteMany();
  });

  const call = (method: string, route: string, body: object | undefined, headers: Record<string, string> = {}) =>
    auth.handler(
      new Request(`${ORIGIN}/api/auth/${route}`, {
        method,
        headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );

  /** Entra por código (como um aparelho novo) e devolve o cookie da sessão. */
  const entrar = async (email: string, userAgent: string) => {
    await call("POST", "email-otp/send-verification-otp", { email, type: "sign-in" });
    const code = [...outbox].reverse().find((m) => m.email === email)?.code ?? "";
    const res = await call("POST", "sign-in/email-otp", { email, otp: code }, { "user-agent": userAgent });
    expect(res.status).toBe(200);
    await db.otpSend.deleteMany();
    return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  };

  it("sair de todos os outros encerra as outras sessões e mantém a atual", async () => {
    const email = "varios@teste.dev";
    const celular = await entrar(email, CHROME_ANDROID);
    const iphone = await entrar(email, SAFARI_IPHONE);
    const outroUsuario = await entrar("sozinho@teste.dev", CHROME_ANDROID);
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(await db.session.count({ where: { userId: user.id } })).toBe(2);

    // A lista de aparelhos mostra os dois, com o navegador de cada um.
    const list = await call("GET", "list-sessions", undefined, { cookie: celular });
    const sessions = (await list.json()) as { userAgent: string }[];
    expect(sessions.map((s) => describeDevice(s.userAgent)).sort()).toEqual(["Chrome no Android", "Safari no iPhone"]);

    // Do celular: sair de todos os outros.
    const res = await call("POST", "revoke-other-sessions", {}, { cookie: celular });
    expect(res.status).toBe(200);

    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    expect((await auth.api.getSession({ headers: new Headers({ cookie: celular }) }))?.user.id).toBe(user.id); // a atual segue valendo
    expect(await auth.api.getSession({ headers: new Headers({ cookie: iphone }) })).toBeNull(); // o outro aparelho foi encerrado
    // A sessão de outra pessoa não é afetada.
    expect(await auth.api.getSession({ headers: new Headers({ cookie: outroUsuario }) })).not.toBeNull();
  });

  it("sair deste aparelho encerra só a sessão dele", async () => {
    const email = "dois@teste.dev";
    const a = await entrar(email, CHROME_ANDROID);
    const b = await entrar(email, SAFARI_IPHONE);
    expect((await call("POST", "sign-out", {}, { cookie: a })).status).toBe(200);
    expect(await auth.api.getSession({ headers: new Headers({ cookie: a }) })).toBeNull();
    expect(await auth.api.getSession({ headers: new Headers({ cookie: b }) })).not.toBeNull();
  });
});

describe("describeDevice", () => {
  it("reconhece navegador e sistema", () => {
    expect(describeDevice(CHROME_ANDROID)).toBe("Chrome no Android");
    expect(describeDevice(SAFARI_IPHONE)).toBe("Safari no iPhone");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0")).toBe("Edge no Windows");
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:127.0) Gecko/20100101 Firefox/127.0")).toBe("Firefox no Mac");
    expect(describeDevice("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36")).toBe("Chrome no Linux");
    expect(describeDevice(null)).toBe("Aparelho desconhecido");
    expect(describeDevice("curl/8.0")).toBe("Navegador");
  });
});
