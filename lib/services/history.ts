import { db } from "@/lib/db";
import type { ISODate } from "@/lib/engine";
import { formatEUR } from "@/lib/money";
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
import { fromDbDate } from "./state";
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

const toRows = (txs: { id: string; type: string; amountCents: number; date: Date; groupId: string | null; createdAt: Date; category: string | null }[]): ItemTxRow[] =>
  txs.map((t) => ({
    id: t.id,
    type: t.type,
    amountCents: t.amountCents,
    date: fromDbDate(t.date),
    groupId: t.groupId,
    createdAt: t.createdAt.getTime(),
    manual: t.category === "manual",
  }));

export interface BillDetail {
  bill: BillView;
  history: HistoryDay[];
}

/** Conta + extrato: guardado, retiradas, pagamentos confirmados e o vencimento em aberto. */
export async function getBillDetail(id: string, today: ISODate): Promise<BillDetail | null> {
  const user = await getOrCreateUser();
  const bill = (await listBills(today)).upcoming.find((b) => b.id === id);
  if (!bill) return null;

  const txs = await db.transaction.findMany({ where: { userId: user.id, billId: id } });
  const items: HistoryItem[] = billHistory(toRows(txs), await incomesByGroup(user.id, txs));

  // Vencimento ainda sem resposta final: aparece no topo como informação (sem sinal).
  if (bill.open) {
    const pending = bill.open.kind === "pending";
    items.push({
      id: `open-${id}`,
      date: bill.open.due,
      label: pending ? "Vencimento a confirmar" : "Vencimento em atraso",
      detail: pending
        ? "Você ainda não confirmou se pagou"
        : `Ainda faltam ${formatEUR(Math.max(bill.open.owedCents - bill.open.fundsCents, 0))} para pagar`,
      amountCents: bill.open.owedCents,
      sign: -1,
      neutral: true,
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
