import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { euros } from "@/lib/money";

// Casos 6 a 8: o rascunho do onboarding vira o plano da conta da sessão. Pela rota de verdade
// (POST /api/onboarding/claim), num SQLite próprio. Data fixa: terça, 10/nov/2026.
process.env.DATABASE_URL = "file:./vitest-claim.db";

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

const plano = () => ({
  weeklyLivingCents: euros(120),
  bills: [
    { name: "Aluguel", amountCents: euros(640), dueDay: 1, opening: { mode: "partial", cents: euros(200) } },
    { name: "Curso", amountCents: euros(125), dueDay: 10, opening: { mode: "paid" } },
    { name: "Telefone", amountCents: euros(20), dueDay: 20 },
  ],
  goals: [
    { name: "Viagem", targetCents: euros(600), deadline: "2027-06", weeklyCents: null, isEmergency: false, openingCents: euros(200) },
    { name: "Reserva de emergência", targetCents: euros(400), deadline: null, weeklyCents: euros(25), isEmergency: true, openingCents: euros(150) },
  ],
});

describe("claim do rascunho do onboarding", () => {
  let db: typeof import("@/lib/db").db;
  let POST: (r: Request) => Promise<Response>;
  let bills: typeof import("@/lib/services/bills");
  let goals: typeof import("@/lib/services/goals");
  let state: typeof import("@/lib/services/state");
  let A: string;
  let B: string;

  const claim = async (body: object) => {
    const res = await POST(new Request("http://localhost/api/onboarding/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    return { status: res.status, body: (await res.json()) as { status?: string; error?: string } };
  };
  const snapshot = async (userId: string) =>
    JSON.stringify({
      user: await db.user.findUnique({ where: { id: userId } }),
      bills: await db.bill.findMany({ where: { userId }, orderBy: { id: "asc" } }),
      goals: await db.goal.findMany({ where: { userId }, orderBy: { id: "asc" } }),
      transactions: await db.transaction.findMany({ where: { userId }, orderBy: { id: "asc" } }),
      claims: await db.onboardingClaim.count({ where: { userId } }),
    });

  beforeAll(async () => {
    for (const f of ["vitest-claim.db", "vitest-claim.db-journal"]) rmSync(path.join(__dirname, "../prisma", f), { force: true });
    execSync("npx prisma db push --skip-generate", { stdio: "pipe", env: process.env });
    ({ db } = await import("@/lib/db"));
    ({ POST } = await import("@/app/api/onboarding/claim/route"));
    bills = await import("@/lib/services/bills");
    goals = await import("@/lib/services/goals");
    state = await import("@/lib/services/state");
    A = (await db.user.create({ data: { name: "A", email: "a@teste.dev" } })).id;
    B = (await db.user.create({ data: { name: "B", email: "b@teste.dev" } })).id;
  }, 90_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("sem sessão: 401", async () => {
    session.userId = "";
    expect((await claim({ draftId: "draft-sem-sessao", draft: plano() })).status).toBe(401);
  });

  it("6. grava contas, metas e saldos iniciais do rascunho no usuário da sessão (e ignora userId do corpo)", async () => {
    session.userId = A;
    const r = await claim({ draftId: "draft-0001", userId: B, draft: { ...plano(), userId: B } });
    expect(r).toEqual({ status: 200, body: { status: "saved" } });

    expect(await db.user.findUniqueOrThrow({ where: { id: A } })).toMatchObject({ onboarded: true, weeklyLivingCents: euros(120) });
    expect((await db.bill.findMany({ where: { userId: A }, orderBy: { name: "asc" } })).map((b) => [b.name, b.savedCents])).toEqual([
      ["Aluguel", euros(200)],
      ["Curso", 0],
      ["Telefone", 0],
    ]);
    expect((await db.goal.findMany({ where: { userId: A }, orderBy: { priority: "asc" } })).map((g) => [g.name, g.priority, g.savedCents, g.isEmergency])).toEqual([
      ["Viagem", 1, euros(200), false],
      ["Reserva de emergência", 2, euros(150), true],
    ]);
    const opens = await db.transaction.findMany({ where: { userId: A, type: "opening_balance" } });
    expect(opens).toHaveLength(4); // Aluguel, Curso (já pago), Viagem, Reserva
    expect(await db.onboardingClaim.count({ where: { userId: A, draftId: "draft-0001" } })).toBe(1);

    // O userId do corpo foi ignorado: nada foi parar no usuário B.
    expect(await db.bill.count({ where: { userId: B } })).toBe(0);
    expect(await db.goal.count({ where: { userId: B } })).toBe(0);
    expect(await db.user.findUniqueOrThrow({ where: { id: B } })).toMatchObject({ onboarded: false });
  });

  it("valida no servidor: valores inválidos viram 400 e nada é gravado", async () => {
    session.userId = B;
    const base = plano();
    const ruins: object[] = [
      { draftId: "draft-r1", draft: { ...base, weeklyLivingCents: -5 } },
      { draftId: "draft-r2", draft: { ...base, bills: [{ ...base.bills[0], name: "  " }] } },
      { draftId: "draft-r3", draft: { ...base, bills: [{ ...base.bills[0], dueDay: 40 }] } },
      { draftId: "draft-r4", draft: { ...base, goals: [{ ...base.goals[0], targetCents: 1.5 }] } },
      { draftId: "draft-r5", draft: { ...base, bills: [{ ...base.bills[0], opening: { mode: "partial", cents: euros(700) } }] } }, // acima do valor da conta
      { draftId: "draft-r6", draft: { ...base, bills: [{ name: "Internet", amountCents: euros(40), dueDay: 28, opening: { mode: "paid" } }] } }, // vencimento do mês ainda não chegou
      { draftId: "x", draft: base },
      { draft: base },
      { draftId: "draft-r7" },
    ];
    for (const body of ruins) expect((await claim(body)).status, JSON.stringify(body).slice(0, 80)).toBe(400);
    expect(await db.bill.count({ where: { userId: B } })).toBe(0);
    expect(await db.onboardingClaim.count({ where: { userId: B } })).toBe(0);
  });

  it("7. o mesmo draftId duas vezes não duplica nada (em sequência e ao mesmo tempo)", async () => {
    session.userId = A;
    const before = await snapshot(A);
    expect(await claim({ draftId: "draft-0001", draft: plano() })).toEqual({ status: 200, body: { status: "already" } });
    expect(await snapshot(A)).toBe(before);

    // Duplo toque: dois pedidos simultâneos de uma conta nova.
    session.userId = B;
    const results = await Promise.all([claim({ draftId: "draft-duplo", draft: plano() }), claim({ draftId: "draft-duplo", draft: plano() })]);
    expect(results.map((r) => r.body.status).sort()).toEqual(["already", "saved"]);
    expect(await db.bill.count({ where: { userId: B } })).toBe(3);
    expect(await db.goal.count({ where: { userId: B } })).toBe(2);
    expect(await db.transaction.count({ where: { userId: B, type: "opening_balance" } })).toBe(4);
    expect(await db.onboardingClaim.count({ where: { userId: B } })).toBe(1);
  });

  describe("8. conta que já tem plano", () => {
    const outro = () => ({
      weeklyLivingCents: euros(150),
      bills: [{ name: "Aluguel", amountCents: euros(700), dueDay: 1 }, { name: "Gás", amountCents: euros(30), dueDay: 15 }],
      goals: [{ name: "Carro", targetCents: euros(1000), deadline: null, weeklyCents: euros(50), isEmergency: false }],
    });

    it("sem escolha: devolve 409 e não grava nada", async () => {
      session.userId = A;
      const before = await snapshot(A);
      const r = await claim({ draftId: "draft-novo-1", draft: outro() });
      expect(r).toEqual({ status: 409, body: { status: "has_plan" } });
      expect(await snapshot(A)).toBe(before);
    });

    it('"Usar o plano salvo" (keep) descarta o rascunho: nada é gravado', async () => {
      session.userId = A;
      const before = await snapshot(A);
      expect(await claim({ draftId: "draft-novo-1", mode: "keep", draft: outro() })).toEqual({ status: 200, body: { status: "kept" } });
      expect(await snapshot(A)).toBe(before);
    });

    it('"Substituir pelo novo" (replace) zera os saldos antigos, arquiva o plano antigo e grava o novo', async () => {
      session.userId = A;
      const historicoAntes = await db.transaction.count({ where: { userId: A } });
      const r = await claim({ draftId: "draft-novo-1", mode: "replace", draft: outro() });
      expect(r).toEqual({ status: 200, body: { status: "saved" } });

      // Os saldos antigos viraram adjustments "reset" (Aluguel €200, Viagem €200, Reserva €150), num mesmo grupo.
      const resets = await db.transaction.findMany({ where: { userId: A, type: "adjustment", reason: "reset" } });
      expect(resets.map((t) => [t.note, t.amountCents]).sort()).toEqual([["Aluguel", -euros(200)], ["Reserva de emergência", -euros(150)], ["Viagem", -euros(200)]].sort());
      expect(new Set(resets.map((t) => t.groupId)).size).toBe(1);

      // As antigas ficaram arquivadas (e sem saldo); as novas estão ativas.
      const antigas = await db.bill.findMany({ where: { userId: A, archivedAt: { not: null } } });
      expect(antigas.map((b) => b.name).sort()).toEqual(["Aluguel", "Curso", "Telefone"]);
      expect(antigas.every((b) => b.savedCents === 0)).toBe(true);
      expect((await db.goal.count({ where: { userId: A, archivedAt: { not: null } } }))).toBe(2);

      // Nada do plano antigo aparece nas telas nem no motor.
      expect((await bills.listBills(A, TODAY)).upcoming.map((b) => b.name).sort()).toEqual(["Aluguel", "Gás"]);
      expect((await goals.listGoals(A, TODAY)).goals.map((g) => [g.name, g.priority])).toEqual([["Carro", 1]]);
      const { state: engine } = await state.loadState(A);
      expect(engine.bills.map((b) => b.name).sort()).toEqual(["Aluguel", "Gás"]);
      expect(engine.goals.map((g) => g.name)).toEqual(["Carro"]);
      expect(await bills.getBill(A, antigas[0].id)).toBeNull(); // arquivada = não encontrada

      // O histórico antigo continua: nada foi apagado.
      expect(await db.transaction.count({ where: { userId: A } })).toBeGreaterThanOrEqual(historicoAntes + 3);
      expect(await db.transaction.count({ where: { userId: A, type: "opening_balance" } })).toBe(4);
      expect(await db.user.findUniqueOrThrow({ where: { id: A } })).toMatchObject({ weeklyLivingCents: euros(150), onboarded: true });

      // E o outro usuário não foi tocado.
      expect(await db.bill.count({ where: { userId: B, archivedAt: null } })).toBe(3);
    });
  });
});
