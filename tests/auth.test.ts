import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Casos 1 a 5 do login: código por e-mail com o Better Auth de verdade, num SQLite próprio.
process.env.DATABASE_URL = "file:./vitest-auth.db";
process.env.EMAIL_TRANSPORT = "memory";
process.env.AUTH_RATE_LIMIT = "off"; // o limite por IP tem teste próprio; aqui entramos várias vezes da mesma máquina
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.BETTER_AUTH_SECRET = "teste-teste-teste-teste-teste-teste-123456";

// Fora do Next não há cookies()/headers() de requisição.
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => undefined, getAll: () => [], delete: () => undefined }),
}));

const ORIGIN = "http://localhost:3000";

describe("login por e-mail com código (Better Auth)", () => {
  let db: typeof import("@/lib/db").db;
  let auth: typeof import("@/lib/auth/auth").auth;
  let outbox: typeof import("@/lib/auth/email").outbox;

  beforeAll(async () => {
    for (const f of ["vitest-auth.db", "vitest-auth.db-journal"]) rmSync(path.join(__dirname, "../prisma", f), { force: true });
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
    await db.otpSend.deleteMany(); // o limite de 30 s entre envios tem teste próprio
  });

  const post = (route: string, body: object) =>
    auth.handler(
      new Request(`${ORIGIN}/api/auth/${route}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify(body),
      }),
    );
  const sendCode = (email: string) => post("email-otp/send-verification-otp", { email, type: "sign-in" });
  const signIn = (email: string, otp: string) => post("sign-in/email-otp", { email, otp });
  const lastCode = (email: string) => [...outbox].reverse().find((m) => m.email === email)?.code ?? "";
  const cookieOf = (res: Response) => (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  it("1. e-mail novo + código correto: cria a conta e abre a sessão", async () => {
    const email = "nova@teste.dev";
    expect((await sendCode(email)).status).toBe(200);
    const code = lastCode(email);
    expect(code).toMatch(/^\d{6}$/);

    const res = await signIn(email, code);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; user: { id: string; email: string } };
    expect(body.user.email).toBe(email);

    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({ emailVerified: true, name: "", onboarded: false });
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);

    // O cookie de sessão é HttpOnly + SameSite=Lax (sem Secure só porque o endereço aqui é http).
    const setCookie = (res.headers.getSetCookie?.() ?? []).find((c) => c.includes("session_token")) ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Max-Age=5184000/); // 60 dias

    // A sessão vale para o servidor (é o que requireUser() lê).
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookieOf(res) }) });
    expect(session?.user.id).toBe(user.id);
  });

  it("2. e-mail existente: entra na mesma conta e não cria outra", async () => {
    const email = "existente@teste.dev";
    await sendCode(email);
    const first = (await (await signIn(email, lastCode(email))).json()) as { user: { id: string } };

    await db.otpSend.deleteMany();
    await sendCode(email);
    const second = (await (await signIn(email, lastCode(email))).json()) as { user: { id: string } };

    expect(second.user.id).toBe(first.user.id);
    expect(await db.user.count({ where: { email } })).toBe(1);
    expect(await db.session.count({ where: { userId: first.user.id } })).toBe(2); // dois aparelhos/entradas
  });

  it("3. código errado 5 vezes invalida o código (até o certo deixa de valer)", async () => {
    const email = "tentativas@teste.dev";
    await sendCode(email);
    const code = lastCode(email);
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 1; i <= 5; i++) {
      const r = await signIn(email, wrong);
      expect(r.status, `tentativa ${i}`).toBe(400);
    }
    const certo = await signIn(email, code);
    expect(certo.status).toBe(403);
    expect(((await certo.json()) as { code: string }).code).toBe("TOO_MANY_ATTEMPTS");
    expect(await db.user.count({ where: { email } })).toBe(0);
  });

  it("4. código com mais de 10 minutos é rejeitado", async () => {
    const email = "expirado@teste.dev";
    await sendCode(email);
    const code = lastCode(email);

    // Dentro do prazo o código vale; "envelhecemos" 11 minutos.
    const v = await db.verification.findFirstOrThrow({ where: { identifier: { contains: email } } });
    expect(v.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
    expect(v.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(10 * 60_000);
    await db.verification.update({ where: { id: v.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });

    const res = await signIn(email, code);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("OTP_EXPIRED");
    expect(await db.user.count({ where: { email } })).toBe(0);
  });

  it("5. pedir código devolve exatamente a mesma resposta para e-mail existente e inexistente", async () => {
    await sendCode("ja-tem@teste.dev");
    await signIn("ja-tem@teste.dev", lastCode("ja-tem@teste.dev"));
    await db.otpSend.deleteMany();
    outbox.length = 0;

    const existente = await sendCode("ja-tem@teste.dev");
    const inexistente = await sendCode("nunca-vi@teste.dev");
    expect(existente.status).toBe(inexistente.status);
    expect(await existente.json()).toEqual(await inexistente.json());
    expect([...existente.headers.keys()].filter((k) => k !== "date").sort()).toEqual([...inexistente.headers.keys()].filter((k) => k !== "date").sort());
    // E nenhum e-mail novo é criado só por pedir o código.
    expect(await db.user.count({ where: { email: "nunca-vi@teste.dev" } })).toBe(0);
    expect(outbox.map((m) => m.email).sort()).toEqual(["ja-tem@teste.dev", "nunca-vi@teste.dev"]);
  });

  it("limite por e-mail: respostas iguais, mas só 1 envio a cada 30 s e no máximo 5 em 10 min", async () => {
    const email = "limite@teste.dev";
    const first = await sendCode(email);
    const code = lastCode(email);
    const second = await sendCode(email); // dentro dos 30 s: não envia, mas responde igual
    expect(second.status).toBe(first.status);
    expect(await second.json()).toEqual({ success: true });
    expect(outbox.filter((m) => m.email === email)).toHaveLength(1);
    // O código já enviado continua valendo (o reenvio reaproveita o mesmo código).
    expect((await signIn(email, code)).status).toBe(200);

    const { allowOtpSend, OTP_SEND_MAX } = await import("@/lib/auth/throttle");
    await db.otpSend.deleteMany();
    const start = new Date("2026-11-10T10:00:00Z");
    for (let i = 0; i < OTP_SEND_MAX; i++) {
      expect(await allowOtpSend("muitos@teste.dev", new Date(start.getTime() + i * 60_000))).toBe(true);
    }
    expect(await allowOtpSend("muitos@teste.dev", new Date(start.getTime() + 6 * 60_000))).toBe(false);
    expect(await allowOtpSend("muitos@teste.dev", new Date(start.getTime() + 11 * 60_000 + 1))).toBe(true); // a janela passou
  });

  it("o texto do e-mail é curto e em português", async () => {
    const { otpEmailText } = await import("@/lib/auth/email");
    expect(otpEmailText("123456")).toBe("Seu código do Finança é 123456. Ele vale por 10 minutos.");
  });
});
