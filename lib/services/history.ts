import { db } from "@/lib/db";
import { settleBill, type ISODate } from "@/lib/engine";
import {
  billHistory,
  goalHistory,
  groupByDate,
  type HistoryDay,
  type HistoryItem,
  type ItemTxRow,
} from "@/lib/statement";
import { listBills, type BillView } from "./bills";
import { listGoals, type GoalView } from "./goals";
import { fromDbDate, toBillState } from "./state";
import { getOrCreateUser } from "./user";

/** Valor recebido em cada recebimento, para dizer "do recebimento de €X". */
async function incomesByGroup(userId: string, rows: { groupId: string | null }[]) {
  const ids = [...new Set(rows.map((r) => r.groupId).filter((g): g is string => !!g))];
  if (ids.length === 0) return new Map<string, number>();
  const incomes = await db.transaction.findMany({
    where: { userId, type: "income", groupId: { in: ids } },
    select: { groupId: true, amountCents: true },
  });
  return new Map(incomes.map((i) => [i.groupId as string, i.amountCents]));
}

const toRows = (txs: { id: string; type: string; amountCents: number; date: Date; groupId: string | null; createdAt: Date }[]): ItemTxRow[] =>
  txs.map((t) => ({
    id: t.id,
    type: t.type,
    amountCents: t.amountCents,
    date: fromDbDate(t.date),
    groupId: t.groupId,
    createdAt: t.createdAt.getTime(),
  }));

export interface BillDetail {
  bill: BillView;
  history: HistoryDay[];
}

/** Conta + extrato: quanto foi guardado a cada recebimento e o último vencimento. */
export async function getBillDetail(id: string, today: ISODate): Promise<BillDetail | null> {
  const user = await getOrCreateUser();
  const row = await db.bill.findFirst({ where: { id, userId: user.id } });
  if (!row) return null;
  const bill = (await listBills(today)).upcoming.find((b) => b.id === id);
  if (!bill) return null;

  const txs = await db.transaction.findMany({ where: { userId: user.id, billId: id } });
  const items: HistoryItem[] = billHistory(toRows(txs), await incomesByGroup(user.id, txs));

  // Último vencimento (derivado do estado: o app não registra pagamentos antigos).
  const settled = settleBill(toBillState(row), today);
  if (settled.unpaidDue) {
    items.push({
      id: `unpaid-${id}`,
      date: settled.unpaidDue,
      label: "Vencimento sem pagamento",
      detail: "Marcado como não pago · ainda a pagar",
      amountCents: row.amountCents,
      sign: -1,
      neutral: true,
      createdAt: Number.MAX_SAFE_INTEGER,
    });
  } else if (settled.paidThrough && settled.paidThrough > toBillState(row).createdOn && settled.consumedCents > 0) {
    items.push({
      id: `paid-${id}`,
      date: settled.paidThrough,
      label: "Vencimento pago",
      detail: "Considerado pago com o valor guardado",
      amountCents: settled.consumedCents,
      sign: -1,
      createdAt: Number.MAX_SAFE_INTEGER,
    });
  }

  return { bill, history: groupByDate(items) };
}

export interface GoalDetail {
  goal: GoalView;
  history: HistoryDay[];
}

/** Meta + extrato: guardado a cada recebimento e retiradas. */
export async function getGoalDetail(id: string, today: ISODate): Promise<GoalDetail | null> {
  const user = await getOrCreateUser();
  const goal = (await listGoals(today)).goals.find((g) => g.id === id);
  if (!goal) return null;
  const txs = await db.transaction.findMany({ where: { userId: user.id, goalId: id } });
  return { goal, history: groupByDate(goalHistory(toRows(txs), await incomesByGroup(user.id, txs))) };
}
