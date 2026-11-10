import type { Bill, Goal, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { weekPool, weekRange, weekSpent, weekTxsOf, type EngineBill, type EngineGoal, type EngineState, type ISODate } from "@/lib/engine";
import type { Cents } from "@/lib/money";
import { todayISO } from "@/lib/today";
import { getOrCreateUser } from "./user";

export const toBillState = (b: Bill): EngineBill => ({
  id: b.id,
  name: b.name,
  amountCents: b.amountCents,
  dueDay: b.dueDay,
  savedCents: b.savedCents,
  paidThrough: b.paidThrough,
  consumedCents: b.consumedCents,
  unpaidDue: b.unpaidDue,
  unpaidCents: b.unpaidCents,
  confirmedThrough: b.confirmedThrough,
  createdOn: todayISO(b.createdAt),
});

/** Campos do ciclo da conta que o motor altera e precisam ser gravados. */
export const billCycleData = (b: EngineBill) => ({
  paidThrough: b.paidThrough,
  consumedCents: b.consumedCents,
  unpaidDue: b.unpaidDue,
  unpaidCents: b.unpaidCents,
  confirmedThrough: b.confirmedThrough,
  savedCents: b.savedCents,
});

export const toGoalState =(g: Goal): EngineGoal => ({
  id: g.id,
  name: g.name,
  targetCents: g.targetCents,
  savedCents: g.savedCents,
  deadline: g.deadline,
  weeklyCents: g.weeklyCents,
  priority: g.priority,
  isEmergency: g.isEmergency,
});

/** Lê usuário, contas e metas e monta o estado do motor. */
export async function loadState() {
  const user = await getOrCreateUser();
  const [bills, goals] = await Promise.all([
    db.bill.findMany({ where: { userId: user.id }, orderBy: { id: "asc" } }),
    db.goal.findMany({ where: { userId: user.id }, orderBy: { priority: "asc" } }),
  ]);
  const state: EngineState = {
    weeklyLivingCents: user.weeklyLivingCents,
    bills: bills.map(toBillState),
    goals: goals.map(toGoalState),
  };
  return { user, state, bills, goals };
}

/** Transações guardam a data como meia-noite UTC do dia ISO. */
export const toDbDate = (iso: ISODate) => new Date(`${iso}T00:00:00.000Z`);
export const fromDbDate = (d: Date): ISODate => d.toISOString().slice(0, 10);

/** Quando um registro criado em `today` "nasceu" (meio-dia local: `todayISO(createdAt)` devolve o mesmo dia). */
export const createdAtOf = (today: ISODate) => new Date(`${today}T12:00:00`);

export interface WeekStats {
  start: ISODate;
  end: ISODate;
  /** Dinheiro livre da semana: recebido − guardado + retirado de metas. */
  poolCents: Cents;
  spentCents: Cents;
  /** Livre restante = pool − gastos. */
  freeLeftCents: Cents;
}

/** Cliente do banco ou de uma transação interativa (para ler o livre dentro da mesma transação). */
type TxReader = Pick<PrismaClient, "transaction">;

/**
 * Livre da semana, derivado só das transações da semana que contém `date`.
 * Ajustes de saldo que mexem no livre entram pela tradução de `weekTxsOf`.
 */
export async function weekStats(userId: string, date: ISODate, weekStartDay: number, client: TxReader = db): Promise<WeekStats> {
  const { start, end } = weekRange(date, weekStartDay);
  const txs = await client.transaction.findMany({
    where: { userId, date: { gte: toDbDate(start), lte: toDbDate(end) } },
    select: { type: true, amountCents: true, affectsWeeklyFree: true, undoneAt: true },
  });
  const poolCents = weekPool(weekTxsOf(txs));
  const spentCents = weekSpent(txs);
  return { start, end, poolCents, spentCents, freeLeftCents: poolCents - spentCents };
}
