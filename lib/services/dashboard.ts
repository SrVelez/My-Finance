import { db } from "@/lib/db";
import { buildDashboard } from "@/lib/dashboard";
import { intervaloAnterior, intervaloDo } from "@/lib/dashboard/periodo";
import type { DashBill, DashGoal, DashTx, Dashboard, Periodo } from "@/lib/dashboard/types";
import { nextDue, openDueAmount, settleBill, weeklyReceiptsUntil, type ISODate } from "@/lib/engine";
import { fromDbDate, toBillState, toDbDate } from "./state";
import { active } from "./scope";
import { getUser } from "./user";

interface DashboardUser {
  id: string;
  weekStartDay: number;
  weeklyLivingCents: number;
}

/** Resumo do usuário da sessão. */
export async function getDashboard(userId: string, periodo: Periodo, today: ISODate): Promise<Dashboard> {
  return getDashboardFor(await getUser(userId), periodo, today);
}

/** Lê só os dados de `user` (toda consulta filtra por `userId`) e agrega. */
export async function getDashboardFor(user: DashboardUser, periodo: Periodo, today: ISODate): Promise<Dashboard> {
  const intervalo = intervaloDo(periodo, today, user.weekStartDay);
  const desde = intervaloAnterior(intervalo, periodo).inicio;

  const [txs, recebimentosTotais, goals, bills, goalBase] = await Promise.all([
    db.transaction.findMany({
      where: { userId: user.id, date: { gte: toDbDate(desde), lte: toDbDate(intervalo.fim) } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    db.transaction.count({ where: { userId: user.id, type: "income" } }),
    db.goal.findMany({ where: { userId: user.id, ...active } }),
    db.bill.findMany({ where: { userId: user.id, ...active } }),
    // Saldo inicial e ajustes ativos de metas: de onde o ritmo esperado parte.
    db.transaction.findMany({
      where: { userId: user.id, goalId: { not: null }, type: { in: ["opening_balance", "adjustment"] }, undoneAt: null },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { goalId: true, date: true, balanceAfterCents: true },
    }),
  ]);

  // O último registro de cada meta vence: é o saldo mais recente conhecido de fora do fluxo normal.
  const baselines = new Map<string, { cents: number; date: string }>();
  for (const t of goalBase) {
    if (t.goalId && t.balanceAfterCents !== null) baselines.set(t.goalId, { cents: t.balanceAfterCents, date: fromDbDate(t.date) });
  }

  const dashTxs: DashTx[] = txs.map((t) => ({
    id: t.id,
    type: t.type,
    amountCents: t.amountCents,
    category: t.category,
    date: fromDbDate(t.date),
    groupId: t.groupId,
    shortfallCents: t.shortfallCents,
    note: t.note,
    affectsWeeklyFree: t.affectsWeeklyFree,
    undoneAt: t.undoneAt,
  }));

  const dashGoals: DashGoal[] = goals.map((g) => ({
    id: g.id,
    name: g.name,
    targetCents: g.targetCents,
    savedCents: g.savedCents,
    deadline: g.deadline,
    weeklyCents: g.weeklyCents,
    priority: g.priority,
    createdOn: fromDbDate(g.createdAt),
    baseline: baselines.get(g.id) ?? null,
  }));

  const dashBills: DashBill[] = bills.map((row) => {
    const settled = settleBill(toBillState(row), today);
    const overdue = !!settled.unpaidDue;
    return {
      targetCents: overdue ? openDueAmount(settled) : row.amountCents,
      savedCents: overdue ? settled.consumedCents : settled.savedCents,
      receiptsLeft: weeklyReceiptsUntil(today, nextDue(settled, today)),
    };
  });

  return buildDashboard({
    periodo,
    today,
    weekStartDay: user.weekStartDay,
    weeklyLivingCents: user.weeklyLivingCents,
    txs: dashTxs,
    goals: dashGoals,
    bills: dashBills,
    recebimentosTotais,
  });
}
