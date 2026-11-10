import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { euros } from "@/lib/money";

// Casos 12 e 13: apagar a conta e exportar os dados, sem tocar nos dados de outra pessoa.
process.env.DATABASE_URL = "file:./vitest-account.db";

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth/session", async () => {
  const { UnauthorizedError } = await import("@/lib/auth/errors");
  return {
    requireUser: async () => {
      if (!session.userId) throw new UnauthorizedError();
      return { userId: session.userId };
    },
  };
});
vi.mock("@/lib/services/today", () => ({ serverToday: async () => "2026-11-10" }));

const TODAY = "2026-11-10";
const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("conta: exportar e apagar", () => {
  let db: typeof import("@/lib/db").db;
  let GET: () => Promise<Response>;
  let account: typeof import("@/lib/services/account");
  let bills: typeof import("@/lib/services/bills");
  let goals: typeof import("@/lib/services/goals");
  let balance: typeof import("@/lib/services/balance");
  let A: string;
  let B: string;

  /** Tudo o que pertence a um usuário (inclusive as tabelas de login), para comparar antes e depois. */
  const counts = async (userId: string, email: string) => ({
    user: await db.user.count({ where: { id: userId } }),
    bills: await db.bill.count({ where: { userId } }),
    goals: await db.goal.count({ where: { userId } }),
    transactions: await db.transaction.count({ where: { userId } }),
    sessions: await db.session.count({ where: { userId } }),
    accounts: await db.account.count({ where: { userId } }),
    passkeys: await db.passkey.count({ where: { userId } }),
    claims: await db.onboardingClaim.count({ where: { userId } }),
    otpSends: await db.otpSend.count({ where: { email } }),
    verifications: await db.verification.count({ where: { identifier: { contains: email } } }),
  });

  const populate = async (userId: string, email: string, marker: string) => {
    const user = { id: userId, weekStartDay: 1 };
    await bills.createBillFor(userId, { name: `${marker}-Aluguel`, amountCents: euros(640), dueDay: 1 }, { mode: "partial", cents: euros(200) }, TODAY);
    await goals.createGoalFor(userId, { name: `${marker}-Reserva`, targetCents: euros(400), deadline: null, weeklyCents: euros(25), isEmergency: true }, euros(150), TODAY);
    const goal = await db.goal.findFirstOrThrow({ where: { userId } });
    await balance.adjustBalanceFor(user, "goal", goal.id, { newBalanceCents: euros(100), reason: "used" }, TODAY);
    await db.transaction.create({ data: { userId, type: "income", amountCents: euros(500), date: at(TODAY), shortfallCents: 0 } });
    await db.bill.create({ data: { userId, name: `${marker}-Arquivada`, amountCents: 100, dueDay: 3, archivedAt: new Date() } });
    await db.session.create({ data: { userId, token: `tok-${marker}-secreto`, expiresAt: new Date(Date.now() + 86_400_000) } });
    await db.account.create({ data: { userId, accountId: `g-${marker}`, providerId: "google", accessToken: `acesso-${marker}-secreto` } });
    await db.passkey.create({ data: { userId, name: `${marker}-passkey`, publicKey: `chave-${marker}-secreta`, credentialID: `cred-${marker}`, counter: 0, deviceType: "singleDevice", backedUp: false } });
    await db.onboardingClaim.create({ data: { userId, draftId: `draft-${marker}` } });
    await db.otpSend.create({ data: { email } });
    await db.verification.create({ data: { identifier: `sign-in-otp-${email}`, value: "x", expiresAt: new Date(Date.now() + 60_000) } });
  };

  beforeAll(async () => {
    for (const f of ["vitest-account.db", "vitest-account.db-journal"]) rmSync(path.join(__dirname, "../prisma", f), { force: true });
    execSync("npx prisma db push --skip-generate", { stdio: "pipe", env: process.env });
    ({ db } = await import("@/lib/db"));
    ({ GET } = await import("@/app/api/account/export/route"));
    account = await import("@/lib/services/account");
    bills = await import("@/lib/services/bills");
    goals = await import("@/lib/services/goals");
    balance = await import("@/lib/services/balance");

    A = (await db.user.create({ data: { name: "Ana", email: "ana@teste.dev", weeklyLivingCents: euros(120), onboarded: true } })).id;
    B = (await db.user.create({ data: { name: "Beto", email: "beto@teste.dev", weeklyLivingCents: euros(99), onboarded: true } })).id;
    await populate(A, "ana@teste.dev", "ANA");
    await populate(B, "beto@teste.dev", "BETO");
  }, 90_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("13. exportar devolve só os dados da pessoa da sessão (e nenhum segredo de login)", async () => {
    session.userId = A;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="financa-dados-2026-11-10.json"');
    expect(res.headers.get("cache-control")).toBe("no-store");

    const text = await res.text();
    const data = JSON.parse(text);
    expect(data.format).toBe("financa-export-v1");
    expect(data.user).toMatchObject({ id: A, name: "Ana", email: "ana@teste.dev", weeklyLivingCents: euros(120), onboarded: true });
    expect(data.bills.map((b: { name: string }) => b.name).sort()).toEqual(["ANA-Aluguel", "ANA-Arquivada"]); // inclui a arquivada
    expect(data.goals.map((g: { name: string }) => g.name)).toEqual(["ANA-Reserva"]);
    const types = new Set(data.transactions.map((t: { type: string }) => t.type));
    expect([...types].sort()).toEqual(["adjustment", "income", "opening_balance"]);
    expect(data.signInMethods.providers.map((p: { providerId: string }) => p.providerId)).toEqual(["google"]);
    expect(data.signInMethods.passkeys.map((p: { name: string }) => p.name)).toEqual(["ANA-passkey"]);

    // Nada do Beto e nenhum segredo (tokens de sessão/OAuth, chave da passkey).
    for (const proibido of ["BETO", "beto@teste.dev", "tok-", "acesso-", "chave-", "publicKey", "accessToken", "token"]) {
      expect(text, proibido).not.toContain(proibido);
    }
  });

  it("13b. a exportação do Beto também é só dele", async () => {
    session.userId = B;
    const text = await (await GET()).text();
    expect(text).toContain("BETO-Aluguel");
    expect(text).not.toContain("ANA");
    expect(text).not.toContain("ana@teste.dev");
  });

  it("13c. sem sessão, a exportação responde 401", async () => {
    session.userId = "";
    expect((await GET()).status).toBe(401);
  });

  it("12. e-mail digitado errado não apaga nada", async () => {
    const before = await counts(A, "ana@teste.dev");
    expect(await account.deleteAccountFor(A, "outro@teste.dev")).toEqual({ ok: false, error: "O e-mail digitado não confere." });
    expect(await account.deleteAccountFor(A, "")).toMatchObject({ ok: false });
    expect(await counts(A, "ana@teste.dev")).toEqual(before);
  });

  it("12. apagar a conta remove o usuário e TUDO dele; os dados de outra pessoa continuam intactos", async () => {
    const antesDaAna = await counts(A, "ana@teste.dev");
    expect(antesDaAna).toMatchObject({ user: 1, bills: 2, goals: 1, sessions: 1, accounts: 1, passkeys: 1, claims: 1, otpSends: 1, verifications: 1 });
    expect(antesDaAna.transactions).toBeGreaterThan(2);
    const antesDoBeto = await counts(B, "beto@teste.dev");

    // O e-mail vale sem diferenciar maiúsculas e ignora espaços.
    expect(await account.deleteAccountFor(A, "  ANA@teste.dev ")).toEqual({ ok: true });

    expect(await counts(A, "ana@teste.dev")).toEqual({ user: 0, bills: 0, goals: 0, transactions: 0, sessions: 0, accounts: 0, passkeys: 0, claims: 0, otpSends: 0, verifications: 0 });
    expect(await counts(B, "beto@teste.dev")).toEqual(antesDoBeto);
    expect(await db.user.findUnique({ where: { id: B } })).toMatchObject({ name: "Beto" });
  });
});
