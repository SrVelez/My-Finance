import { db } from "@/lib/db";
import { buildStatement, type StatementEntry, type StatementRow } from "@/lib/statement";
import { fromDbDate } from "./state";
import { getOrCreateUser } from "./user";

/**
 * Extrato do usuário (mais recente primeiro). `limit` conta entradas: um
 * recebimento com todas as suas alocações vale uma entrada.
 */
export async function getStatement(limit = 50): Promise<StatementEntry[]> {
  const user = await getOrCreateUser();
  const include = { bill: { select: { name: true } }, goal: { select: { name: true } } };

  // "Cabeças": despesas, recebimentos e movimentações soltas.
  const heads = await db.transaction.findMany({
    where: { userId: user.id, OR: [{ type: "income" }, { type: "expense" }, { groupId: null }] },
    include,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  const groupIds = heads.filter((h) => h.type === "income" && h.groupId).map((h) => h.groupId as string);
  const kids = groupIds.length
    ? await db.transaction.findMany({
        where: { userId: user.id, groupId: { in: groupIds }, type: { not: "income" } },
        include,
        orderBy: { createdAt: "asc" },
      })
    : [];

  const rows: StatementRow[] = [...heads, ...kids].map((t) => ({
    id: t.id,
    type: t.type,
    amountCents: t.amountCents,
    category: t.category,
    date: fromDbDate(t.date),
    note: t.note,
    groupId: t.groupId,
    billId: t.billId,
    goalId: t.goalId,
    billName: t.bill?.name ?? null,
    goalName: t.goal?.name ?? null,
    createdAt: t.createdAt.getTime(),
  }));

  return buildStatement(rows);
}
