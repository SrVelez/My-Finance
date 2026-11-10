import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { euros } from "@/lib/money";

// Integração: banco SQLite próprio (nunca o de desenvolvimento). Data fixa: terça, 10/nov/2026.
process.env.DATABASE_URL = "file:./vitest-balance.db";

const TODAY = "2026-11-10";
const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("saldo inicial e ajuste de saldo (banco real)", () => {
  let db: typeof import("@/lib/db").db;
  let svc: typeof import("@/lib/services/balance");
  let bills: typeof import("@/lib/services/bills");
  let goals: typeof import("@/lib/services/goals");
  let state: typeof import("@/lib/services/state");
  let engine: typeof import("@/lib/engine");

  beforeAll(async () => {
    for (const f of ["vitest-balance.db", "vitest-balance.db-journal"]) rmSync(path.join(__dirname, "../prisma", f), { force: true });
    execSync("npx prisma db push --skip-generate", { stdio: "pipe", env: process.env });
    ({ db } = await import("@/lib/db"));
    svc = await import("@/lib/services/balance");
    bills = await import("@/lib/services/bills");
    goals = await import("@/lib/services/goals");
    state = await import("@/lib/services/state");
    engine = await import("@/lib/engine");
  }, 60_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  const newUser = async (name: string) => {
    const u = await db.user.create({ data: { name, weeklyLivingCents: euros(120), weekStartDay: 1, onboarded: true } });
    return { id: u.id, weekStartDay: 1 };
  };
  const addIncome = (userId: string, cents: number) =>
    db.transaction.create({ data: { userId, type: "income", amountCents: cents, date: at(TODAY) } });
  const pool = async (u: { id: string }) => (await state.weekStats(u.id, TODAY, 1)).poolCents;

  const goalInput = (name: string, targetCents: number, extra: Partial<{ deadline: string | null; weeklyCents: number; isEmergency: boolean }> = {}) => ({
    name,
    targetCents,
    deadline: null,
    weeklyCents: 0,
    isEmergency: false,
    ...extra,
  });
  const lastGoal = (userId: string, name: string) => db.goal.findFirstOrThrow({ where: { userId, name } });
  const lastBill = (userId: string, name: string) => db.bill.findFirstOrThrow({ where: { userId, name } });

  describe("criação com saldo inicial", () => {
    it("1. Viagem €600 até jun/2027 com €200: 33% e €13/semana (não €19)", async () => {
      const u = await newUser("c1");
      await goals.createGoalFor(u.id, goalInput("Viagem", euros(600), { deadline: "2027-06" }), euros(200), TODAY);
      const g = await lastGoal(u.id, "Viagem");
      expect(g.savedCents).toBe(euros(200));
      expect(Math.round((g.savedCents / g.targetCents) * 100)).toBe(33);
      expect(engine.planGoal(state.toGoalState(g), TODAY).amountCents).toBe(euros(13));
      expect(state.fromDbDate(g.createdAt)).toBe(TODAY);

      const open = await db.transaction.findMany({ where: { goalId: g.id } });
      expect(open).toHaveLength(1);
      expect(open[0]).toMatchObject({ type: "opening_balance", amountCents: euros(200), balanceAfterCents: euros(200) });
    });

    it("2. Renovação do visto €300 com €300: nasce concluída e recebe €0", async () => {
      const u = await newUser("c2");
      await goals.createGoalFor(u.id, goalInput("Renovação do visto", euros(300), { deadline: "2027-02" }), euros(300), TODAY);
      const g = await lastGoal(u.id, "Renovação do visto");
      expect(engine.planGoal(state.toGoalState(g), TODAY)).toEqual({ amountCents: 0, reason: "Meta completa" });
      const { state: s } = { state: { weeklyLivingCents: euros(120), bills: [], goals: [state.toGoalState(g)] } };
      expect(engine.distribute({ incomeCents: euros(500), date: TODAY, state: s }).goalsCents).toBe(0);
    });

    it("3. Aluguel €640 (dia 1) com €200: falta €440; divide €440, não €640", async () => {
      const u = await newUser("c3");
      await bills.createBillFor(u.id, { name: "Aluguel", amountCents: euros(640), dueDay: 1 }, { mode: "partial", cents: euros(200) }, TODAY);
      const row = await lastBill(u.id, "Aluguel");
      const settled = engine.settleBill(state.toBillState(row), TODAY);
      expect(settled.savedCents).toBe(euros(200));
      const plan = engine.planBill(settled, TODAY);
      expect(plan.reason).toBe("Faltam €440 até 1/dez, em 3 pagamentos");
      expect(plan.amountCents).toBe(euros(147));
    });

    it("4. Curso €125 (dia 10) 'já paguei este mês': ciclo pago e o próximo (10/dez) começa em €0", async () => {
      const u = await newUser("c4");
      await bills.createBillFor(u.id, { name: "Curso", amountCents: euros(125), dueDay: 10 }, { mode: "paid" }, TODAY);
      const row = await lastBill(u.id, "Curso");
      expect(row).toMatchObject({ savedCents: 0, paidThrough: TODAY, confirmedThrough: TODAY });
      const settled = engine.settleBill(state.toBillState(row), TODAY);
      expect(settled.savedCents).toBe(0);
      expect(engine.nextDue(settled, TODAY)).toBe("2026-12-10");
      expect(engine.openDue(settled)).toBeNull();
      const marker = await db.transaction.findFirstOrThrow({ where: { billId: row.id } });
      expect(marker).toMatchObject({ type: "opening_balance", reason: "paid_before", amountCents: 0 });
    });

    it("4b. 'já paguei' antes do vencimento do mês é recusado", async () => {
      const u = await newUser("c4b");
      await expect(
        bills.createBillFor(u.id, { name: "Internet", amountCents: euros(40), dueDay: 20 }, { mode: "paid" }, TODAY),
      ).rejects.toThrow("O vencimento deste mês ainda não chegou.");
    });

    it("5. saldo de €700 numa conta de €640 é rejeitado e nada é criado", async () => {
      const u = await newUser("c5");
      await expect(
        bills.createBillFor(u.id, { name: "Aluguel", amountCents: euros(640), dueDay: 1 }, { mode: "partial", cents: euros(700) }, TODAY),
      ).rejects.toThrow("O valor guardado não pode passar de €640.");
      expect(await db.bill.count({ where: { userId: u.id } })).toBe(0);
      expect(await db.transaction.count({ where: { userId: u.id } })).toBe(0);
    });
  });

  describe("ajustar e zerar", () => {
    const setupReserve = async (name: string) => {
      const u = await newUser(name);
      await goals.createGoalFor(u.id, goalInput("Reserva de emergência", euros(400), { weeklyCents: euros(25), isEmergency: true }), euros(150), TODAY);
      await addIncome(u.id, euros(500));
      return { u, reserva: await lastGoal(u.id, "Reserva de emergência") };
    };

    it("6. zerar a Reserva (€150, reset): saldo €0, livre intacto, histórico guarda opening e adjustment", async () => {
      const { u, reserva } = await setupReserve("a6");
      const before = await pool(u);
      const r = await svc.adjustBalanceFor(u, "goal", reserva.id, { newBalanceCents: 0, reason: "reset" }, TODAY);
      expect(r.ok).toBe(true);
      expect((await db.goal.findUniqueOrThrow({ where: { id: reserva.id } })).savedCents).toBe(0);
      expect(await pool(u)).toBe(before);

      const txs = await db.transaction.findMany({ where: { goalId: reserva.id }, orderBy: { createdAt: "asc" } });
      expect(txs.map((t) => t.type)).toEqual(["opening_balance", "adjustment"]);
      expect(txs[1]).toMatchObject({ amountCents: -euros(150), reason: "reset", affectsWeeklyFree: false, balanceAfterCents: 0 });
    });

    it("7. Reserva €150 → €100 devolvendo ao livre: o livre sobe €50", async () => {
      const { u, reserva } = await setupReserve("a7");
      const before = await pool(u);
      const r = await svc.adjustBalanceFor(u, "goal", reserva.id, { newBalanceCents: euros(100), reason: "return_to_free" }, TODAY);
      expect(r.ok).toBe(true);
      expect(await pool(u)).toBe(before + euros(50));
      expect((await db.goal.findUniqueOrThrow({ where: { id: reserva.id } })).savedCents).toBe(euros(100));
    });

    it("8. aumentar €80 tirando do livre com só €50 livres é bloqueado; €50 passa e zera o livre", async () => {
      const u = await newUser("a8");
      await goals.createGoalFor(u.id, goalInput("Viagem", euros(600)), 0, TODAY);
      await addIncome(u.id, euros(50));
      const g = await lastGoal(u.id, "Viagem");

      const blocked = await svc.adjustBalanceFor(u, "goal", g.id, { newBalanceCents: euros(80), reason: "from_free" }, TODAY);
      expect(blocked).toEqual({ ok: false, error: "Você só tem €50 livres esta semana." });
      expect((await db.goal.findUniqueOrThrow({ where: { id: g.id } })).savedCents).toBe(0);
      expect(await db.transaction.count({ where: { goalId: g.id } })).toBe(0);

      const okRes = await svc.adjustBalanceFor(u, "goal", g.id, { newBalanceCents: euros(50), reason: "from_free" }, TODAY);
      expect(okRes.ok).toBe(true);
      expect((await state.weekStats(u.id, TODAY, 1)).freeLeftCents).toBe(0);
    });

    it("9. desfazer o caso 7 restaura €150 na reserva e o livre original; desfazer de novo falha", async () => {
      const { u, reserva } = await setupReserve("a9");
      const before = await pool(u);
      const adj = await svc.adjustBalanceFor(u, "goal", reserva.id, { newBalanceCents: euros(100), reason: "return_to_free" }, TODAY);
      if (!adj.ok) throw new Error(adj.error);

      expect(await svc.undoAdjustmentFor(u, adj.adjustmentId, TODAY)).toEqual({ ok: true });
      expect((await db.goal.findUniqueOrThrow({ where: { id: reserva.id } })).savedCents).toBe(euros(150));
      expect(await pool(u)).toBe(before);
      const row = await db.transaction.findUniqueOrThrow({ where: { id: adj.adjustmentId } });
      expect(row.undoneAt).not.toBeNull();

      expect(await svc.undoAdjustmentFor(u, adj.adjustmentId, TODAY)).toEqual({ ok: false, error: "Este ajuste já foi desfeito." });
    });

    it("não desfaz um ajuste se houve outra movimentação depois dele", async () => {
      const { u, reserva } = await setupReserve("a9b");
      const adj = await svc.adjustBalanceFor(u, "goal", reserva.id, { newBalanceCents: euros(100), reason: "used" }, TODAY);
      if (!adj.ok) throw new Error(adj.error);
      await sleep(10);
      await db.transaction.create({ data: { userId: u.id, type: "allocation", amountCents: euros(10), date: at(TODAY), goalId: reserva.id, category: "manual" } });
      const r = await svc.undoAdjustmentFor(u, adj.adjustmentId, TODAY);
      expect(r.ok).toBe(false);
      expect((await db.goal.findUniqueOrThrow({ where: { id: reserva.id } })).savedCents).toBe(euros(100));
    });

    it("conta: ajusta o guardado do ciclo, respeita o valor da conta e vira transação", async () => {
      const u = await newUser("a-bill");
      await bills.createBillFor(u.id, { name: "Aluguel", amountCents: euros(640), dueDay: 1 }, { mode: "partial", cents: euros(200) }, TODAY);
      const b = await lastBill(u.id, "Aluguel");

      const r = await svc.adjustBalanceFor(u, "bill", b.id, { newBalanceCents: euros(50), reason: "used" }, TODAY);
      expect(r.ok).toBe(true);
      expect((await lastBill(u.id, "Aluguel")).savedCents).toBe(euros(50));

      const tooMuch = await svc.adjustBalanceFor(u, "bill", b.id, { newBalanceCents: euros(700), reason: "match_bank" }, TODAY);
      expect(tooMuch).toEqual({ ok: false, error: "O valor guardado não pode passar de €640." });
      const adj = await db.transaction.findMany({ where: { billId: b.id, type: "adjustment" } });
      expect(adj).toHaveLength(1);
      expect(adj[0]).toMatchObject({ amountCents: -euros(150), reason: "used", balanceAfterCents: euros(50) });
    });

    it("12. Recomeçar saldos zera tudo, mantém a configuração e gera um ajuste por item com saldo", async () => {
      const u = await newUser("a12");
      await bills.createBillFor(u.id, { name: "Aluguel", amountCents: euros(640), dueDay: 1 }, { mode: "partial", cents: euros(200) }, TODAY);
      await bills.createBillFor(u.id, { name: "Curso", amountCents: euros(125), dueDay: 10 }, { mode: "none" }, TODAY);
      await goals.createGoalFor(u.id, goalInput("Reserva de emergência", euros(400), { weeklyCents: euros(25), isEmergency: true }), euros(150), TODAY);
      await goals.createGoalFor(u.id, goalInput("Viagem", euros(600), { deadline: "2027-06" }), 0, TODAY);

      const snapshot = async () => ({
        bills: (await db.bill.findMany({ where: { userId: u.id }, orderBy: { name: "asc" } })).map((b) => [b.name, b.amountCents, b.dueDay]),
        goals: (await db.goal.findMany({ where: { userId: u.id }, orderBy: { priority: "asc" } })).map((g) => [g.name, g.targetCents, g.deadline, g.priority, g.isEmergency]),
      });
      const config = await snapshot();

      const r = await svc.resetAllBalancesFor(u, TODAY);
      if (!r.ok) throw new Error(r.error);
      expect(r.count).toBe(2); // Aluguel (€200) e Reserva (€150); Curso e Viagem já estavam em €0

      expect(await snapshot()).toEqual(config);
      expect((await lastBill(u.id, "Aluguel")).savedCents).toBe(0);
      expect((await lastGoal(u.id, "Reserva de emergência")).savedCents).toBe(0);
      const adj = await db.transaction.findMany({ where: { userId: u.id, type: "adjustment" } });
      expect(adj).toHaveLength(2);
      expect(adj.every((a) => a.reason === "reset" && a.groupId === r.groupId && a.balanceAfterCents === 0)).toBe(true);
      expect(adj.map((a) => a.amountCents).sort((x, y) => x - y)).toEqual([-euros(200), -euros(150)]);
      // O histórico anterior continua lá.
      expect(await db.transaction.count({ where: { userId: u.id, type: "opening_balance" } })).toBe(2);

      // Desfazer em lote restaura tudo.
      expect(await svc.undoBatchFor(u, r.groupId, TODAY)).toEqual({ ok: true });
      expect((await lastBill(u.id, "Aluguel")).savedCents).toBe(euros(200));
      expect((await lastGoal(u.id, "Reserva de emergência")).savedCents).toBe(euros(150));
    });

    it("13. isolamento: outro usuário não consegue ajustar nem desfazer, e nada muda", async () => {
      const { u: a, reserva } = await setupReserve("a13-dono");
      await bills.createBillFor(a.id, { name: "Aluguel", amountCents: euros(640), dueDay: 1 }, { mode: "partial", cents: euros(200) }, TODAY);
      const bill = await lastBill(a.id, "Aluguel");
      const adj = await svc.adjustBalanceFor(a, "goal", reserva.id, { newBalanceCents: euros(100), reason: "used" }, TODAY);
      if (!adj.ok) throw new Error(adj.error);

      const b = await newUser("a13-intruso");
      expect(await svc.adjustBalanceFor(b, "goal", reserva.id, { newBalanceCents: 0, reason: "reset" }, TODAY)).toEqual({ ok: false, error: "Meta não encontrada." });
      expect(await svc.adjustBalanceFor(b, "bill", bill.id, { newBalanceCents: 0, reason: "reset" }, TODAY)).toEqual({ ok: false, error: "Conta não encontrada." });
      expect(await svc.undoAdjustmentFor(b, adj.adjustmentId, TODAY)).toEqual({ ok: false, error: "Ajuste não encontrado." });
      expect(await svc.resetAllBalancesFor(b, TODAY)).toMatchObject({ ok: true, count: 0 });

      expect((await db.goal.findUniqueOrThrow({ where: { id: reserva.id } })).savedCents).toBe(euros(100));
      expect((await lastBill(a.id, "Aluguel")).savedCents).toBe(euros(200));
    });
  });
});
