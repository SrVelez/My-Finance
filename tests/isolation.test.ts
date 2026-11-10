import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { euros } from "@/lib/money";

// Isolamento entre usuários: para CADA operação de serviço, o usuário B nunca lê nem altera dados do A.
// Banco SQLite próprio (nunca o de desenvolvimento). Data fixa: terça, 10/nov/2026.
process.env.DATABASE_URL = "file:./vitest-isolation.db";

const TODAY = "2026-11-10";

// Quem está "logado" nas server actions deste teste. As actions só conhecem o userId da sessão.
const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ userId: session.userId }) }));
vi.mock("@/lib/services/today", () => ({ serverToday: async () => "2026-11-10" }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

describe("isolamento entre usuários", () => {
  let db: typeof import("@/lib/db").db;
  let bills: typeof import("@/lib/services/bills");
  let goals: typeof import("@/lib/services/goals");
  let balance: typeof import("@/lib/services/balance");
  let history: typeof import("@/lib/services/history");
  let home: typeof import("@/lib/services/home");
  let statement: typeof import("@/lib/services/statement");
  let income: typeof import("@/lib/services/income");
  let expense: typeof import("@/lib/services/expense");
  let settings: typeof import("@/lib/services/settings");
  let onboarding: typeof import("@/lib/services/onboarding");
  let dashboard: typeof import("@/lib/services/dashboard");
  let state: typeof import("@/lib/services/state");

  let A: { id: string; weekStartDay: number };
  let B: { id: string; weekStartDay: number };
  let aBillId: string;
  let aGoalId: string;
  let aAdjustmentId: string;

  const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const goalInput = (name: string, targetCents: number, extra: object = {}) => ({
    name,
    targetCents,
    deadline: null,
    weeklyCents: euros(25),
    isEmergency: false,
    ...extra,
  });

  /** Tudo o que pertence a um usuário, para comparar antes e depois. */
  const snapshot = async (userId: string) =>
    JSON.stringify({
      user: await db.user.findUnique({ where: { id: userId } }),
      bills: await db.bill.findMany({ where: { userId }, orderBy: { id: "asc" } }),
      goals: await db.goal.findMany({ where: { userId }, orderBy: { id: "asc" } }),
      transactions: await db.transaction.findMany({ where: { userId }, orderBy: { id: "asc" } }),
    });

  beforeAll(async () => {
    for (const f of ["vitest-isolation.db", "vitest-isolation.db-journal"]) rmSync(path.join(__dirname, "../prisma", f), { force: true });
    execSync("npx prisma db push --skip-generate", { stdio: "pipe", env: process.env });
    ({ db } = await import("@/lib/db"));
    bills = await import("@/lib/services/bills");
    goals = await import("@/lib/services/goals");
    balance = await import("@/lib/services/balance");
    history = await import("@/lib/services/history");
    home = await import("@/lib/services/home");
    statement = await import("@/lib/services/statement");
    income = await import("@/lib/services/income");
    expense = await import("@/lib/services/expense");
    settings = await import("@/lib/services/settings");
    onboarding = await import("@/lib/services/onboarding");
    dashboard = await import("@/lib/services/dashboard");
    state = await import("@/lib/services/state");

    const mk = async (name: string) => {
      const u = await db.user.create({ data: { name, email: `${name}@teste.dev`, weeklyLivingCents: euros(120), weekStartDay: 1, onboarded: true } });
      return { id: u.id, weekStartDay: 1 };
    };
    A = await mk("a");
    B = await mk("b");

    // O usuário A tem um plano completo e movimentações.
    await bills.createBillFor(A.id, { name: "Aluguel", amountCents: euros(640), dueDay: 1 }, { mode: "partial", cents: euros(200) }, TODAY);
    await goals.createGoalFor(A.id, goalInput("Reserva", euros(400), { isEmergency: true }), euros(150), TODAY);
    await goals.createGoalFor(A.id, goalInput("Viagem", euros(600), { deadline: "2027-06", weeklyCents: 0 }), 0, TODAY);
    aBillId = (await db.bill.findFirstOrThrow({ where: { userId: A.id } })).id;
    aGoalId = (await db.goal.findFirstOrThrow({ where: { userId: A.id, name: "Reserva" } })).id;
    await db.transaction.create({ data: { userId: A.id, type: "income", amountCents: euros(500), date: at(TODAY), shortfallCents: 0 } });
    await expense.registerExpense(A.id, euros(20), "Mercado", TODAY);
    const adj = await balance.adjustBalanceFor(A, "goal", aGoalId, { newBalanceCents: euros(100), reason: "return_to_free" }, TODAY);
    if (!adj.ok) throw new Error(adj.error);
    aAdjustmentId = adj.adjustmentId;
  }, 90_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("9a. leituras: B não vê nada de A", async () => {
    expect((await bills.listBills(B.id, TODAY)).upcoming).toEqual([]);
    expect((await goals.listGoals(B.id, TODAY)).goals).toEqual([]);
    expect(await bills.getBill(B.id, aBillId)).toBeNull();
    expect(await goals.getGoal(B.id, aGoalId)).toBeNull();
    expect(await history.getBillDetail(B.id, aBillId, TODAY)).toBeNull();
    expect(await history.getGoalDetail(B.id, aGoalId, TODAY)).toBeNull();
    expect(await statement.getStatement(B.id, 50)).toEqual([]);
    expect(await balance.getFreeLeft(B.id, TODAY)).toBe(0);

    const h = await home.getHomeData(B.id, TODAY);
    expect(h).toMatchObject({ poolCents: 0, spentCents: 0, freeLeftCents: 0, upcoming: [], goals: [] });

    const d = await dashboard.getDashboard(B.id, "3meses", TODAY);
    expect(d.destaques.recebidoCents).toBe(0);
    expect(d.metas).toEqual([]);
    expect(d.proximoMes.totalCents).toBe(0);
    expect(d.categorias).toEqual([]);

    const week = await state.weekStats(B.id, TODAY, 1);
    expect(week).toMatchObject({ poolCents: 0, spentCents: 0 });
    const { state: engine } = await state.loadState(B.id);
    expect(engine.bills).toEqual([]);
    expect(engine.goals).toEqual([]);
  });

  it("9b. escritas de B com ids de A falham e não alteram nada em A", async () => {
    const before = await snapshot(A.id);
    const notFound = /não encontrad/i;

    await expect(bills.updateBill(B.id, aBillId, { name: "Hack", amountCents: 1, dueDay: 5 })).rejects.toThrow(notFound);
    await expect(bills.deleteBill(B.id, aBillId)).rejects.toThrow(notFound);
    await expect(goals.updateGoal(B.id, aGoalId, goalInput("Hack", 1))).rejects.toThrow(notFound);
    await expect(goals.deleteGoal(B.id, aGoalId)).rejects.toThrow(notFound);
    await expect(goals.reorderGoals(B.id, [aGoalId])).rejects.toThrow("Ordem inválida");

    expect(await bills.confirmBillPayment(B.id, aBillId, null, TODAY)).toEqual({ ok: false, error: "Conta não encontrada." });
    expect(await bills.moveBillMoney(B.id, aBillId, "out", 100, TODAY)).toEqual({ ok: false, error: "Conta não encontrada." });
    expect(await goals.moveGoalMoney(B.id, aGoalId, "out", 100, TODAY)).toEqual({ ok: false, error: "Meta não encontrada." });
    expect(await goals.resolveGoalDeadline(B.id, aGoalId, { type: "none" }, TODAY)).toEqual({ ok: false, error: "Meta não encontrada." });

    expect(await balance.adjustBalance(B.id, "goal", aGoalId, { newBalanceCents: 0, reason: "reset" }, TODAY)).toEqual({ ok: false, error: "Meta não encontrada." });
    expect(await balance.adjustBalance(B.id, "bill", aBillId, { newBalanceCents: 0, reason: "reset" }, TODAY)).toEqual({ ok: false, error: "Conta não encontrada." });
    expect(await balance.undoAdjustment(B.id, aAdjustmentId, TODAY)).toEqual({ ok: false, error: "Ajuste não encontrado." });
    expect(await balance.undoBatch(B.id, "qualquer-grupo", TODAY)).toMatchObject({ ok: false });
    expect(await balance.resetAllBalances(B.id, TODAY)).toMatchObject({ ok: true, count: 0 });

    expect(await snapshot(A.id)).toBe(before);
  });

  it("9c. operações de B só mexem nos dados de B (distribuir, gastar, onboarding, ajustes, apagar)", async () => {
    const before = await snapshot(A.id);

    await bills.createBillFor(B.id, { name: "Internet", amountCents: euros(40), dueDay: 15 }, { mode: "none" }, TODAY);
    await goals.createGoalFor(B.id, goalInput("Curso", euros(300)), 0, TODAY);
    const sim = await income.simulateIncome(B.id, euros(500), TODAY);
    expect(sim.distribution.allocations.map((a) => a.name).sort()).toEqual(["Curso", "Internet"]);

    await income.confirmIncome(B.id, { incomeCents: euros(500), date: TODAY });
    await expense.registerExpense(B.id, euros(10), "Mercado", TODAY);
    await settings.updateSettings(B.id, { name: "Bê", weeklyLivingCents: euros(99), weekStartDay: 3 });
    expect(await snapshot(A.id)).toBe(before);

    const bBill = await db.bill.findFirstOrThrow({ where: { userId: B.id } });
    expect(bBill.userId).toBe(B.id);
    expect(await db.transaction.count({ where: { userId: B.id } })).toBeGreaterThan(2);

    await onboarding.completeOnboardingFor(
      B.id,
      {
        weeklyLivingCents: euros(100),
        bills: [{ id: "x", name: "Telefone", amountCents: euros(20), dueDay: 20 }],
        goals: [],
      },
      TODAY,
    );
    expect(await snapshot(A.id)).toBe(before);
    expect((await db.bill.findMany({ where: { userId: B.id } })).map((b) => b.name)).toEqual(["Telefone"]);

    await settings.resetAllData(B.id);
    expect(await snapshot(A.id)).toBe(before);
    expect(await db.bill.count({ where: { userId: B.id } })).toBe(0);
  });

  it("A ainda tem tudo depois de tudo isso", async () => {
    expect((await bills.listBills(A.id, TODAY)).upcoming).toHaveLength(1);
    expect((await goals.listGoals(A.id, TODAY)).goals).toHaveLength(2);
    expect((await dashboard.getDashboard(A.id, "mes", TODAY)).destaques.recebidoCents).toBe(euros(500));
  });

  describe("10. o userId vem só da sessão: um userId no corpo da requisição é ignorado", () => {
    const meta = (extra: object = {}) => ({ name: "Meta nova", targetCents: euros(100), deadline: null, weeklyCents: euros(10), isEmergency: false, ...extra });

    it("criar: a meta vai para o usuário da sessão, mesmo com userId de A no corpo", async () => {
      const actions = await import("@/app/(app)/metas/actions");
      session.userId = B.id;
      await expect(actions.createGoalAction({ ...meta(), userId: A.id } as never, 0)).rejects.toThrow("NEXT_REDIRECT:/metas");
      expect(await db.goal.count({ where: { userId: B.id, name: "Meta nova" } })).toBe(1);
      expect(await db.goal.count({ where: { userId: A.id, name: "Meta nova" } })).toBe(0);
    });

    it("editar/apagar/mover/ajustar um id de A com a sessão de B falha e A não muda", async () => {
      const before = await snapshot(A.id);
      session.userId = B.id;
      const metas = await import("@/app/(app)/metas/actions");
      const contas = await import("@/app/(app)/contas/actions");
      const comum = await import("@/app/(app)/actions");
      const gastar = await import("@/app/gastar/actions");

      await expect(metas.updateGoalAction(aGoalId, { ...meta(), userId: A.id } as never)).rejects.toThrow(/não encontrad/i);
      await expect(metas.deleteGoalAction(aGoalId)).rejects.toThrow(/não encontrad/i);
      await expect(contas.updateBillAction(aBillId, { name: "Hack", amountCents: 100, dueDay: 3, userId: A.id } as never)).rejects.toThrow(/não encontrad/i);
      await expect(contas.deleteBillAction(aBillId)).rejects.toThrow(/não encontrad/i);
      expect(await contas.confirmPaymentAction(aBillId, null)).toMatchObject({ ok: false });
      expect(await comum.moveMoneyAction("goal", aGoalId, "out", 100)).toMatchObject({ ok: false });
      expect(await comum.adjustBalanceAction("goal", aGoalId, 0, "reset")).toMatchObject({ ok: false });
      expect(await comum.undoAdjustmentAction(aAdjustmentId)).toMatchObject({ ok: false });

      // Um gasto registrado como B (mesmo "enviando" o userId de A) vai para B.
      await expect(gastar.registerExpenseAction(euros(5), "Mercado", TODAY)).rejects.toThrow("NEXT_REDIRECT:/");
      expect(await snapshot(A.id)).toBe(before);
      expect(await db.transaction.count({ where: { userId: B.id, type: "expense", amountCents: euros(5) } })).toBe(1);
    });

    it("as ações de A, com a sessão de A, funcionam normalmente", async () => {
      session.userId = A.id;
      const comum = await import("@/app/(app)/actions");
      const r = await comum.adjustBalanceAction("goal", aGoalId, euros(120), "match_bank");
      expect(r.ok).toBe(true);
      expect((await db.goal.findUniqueOrThrow({ where: { id: aGoalId } })).savedCents).toBe(euros(120));
    });
  });
});
