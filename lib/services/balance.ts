import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  billHolding,
  checkAdjustment,
  isAdjustReason,
  settleBill,
  type AdjustReason,
  type EngineBill,
  type ISODate,
} from "@/lib/engine";
import type { Cents } from "@/lib/money";
import { fail, type ActionResult } from "@/lib/result";
import { billCycleData, toBillState, toDbDate, weekStats } from "./state";
import { getOrCreateUser } from "./user";

export type BalanceKind = "bill" | "goal";

/** O mínimo do usuário que as operações de saldo precisam. */
export interface BalanceUser {
  id: string;
  weekStartDay: number;
}

type Tx = Prisma.TransactionClient;

export type AdjustResult = { ok: true; adjustmentId: string } | { ok: false; error: string };
export type ResetResult = { ok: true; count: number; groupId: string } | { ok: false; error: string };

const NOT_FOUND: Record<BalanceKind, string> = { bill: "Conta não encontrada.", goal: "Meta não encontrada." };

/** Uma conta ou meta com o saldo que a tela mostra. */
interface Holding {
  kind: BalanceKind;
  id: string;
  name: string;
  haveCents: Cents;
  /** Valor do vencimento (conta) ou alvo (meta). */
  targetCents: Cents;
  /** Só contas: estado do ciclo já "fechado" até hoje, para gravar junto com o novo saldo. */
  settled?: EngineBill;
  overdue?: boolean;
}

async function loadHolding(tx: Tx, userId: string, kind: BalanceKind, id: string, today: ISODate): Promise<Holding | null> {
  if (kind === "goal") {
    const goal = await tx.goal.findFirst({ where: { id, userId } });
    return goal && { kind, id, name: goal.name, haveCents: goal.savedCents, targetCents: goal.targetCents };
  }
  const row = await tx.bill.findFirst({ where: { id, userId } });
  if (!row) return null;
  const settled = settleBill(toBillState(row), today);
  const h = billHolding(settled);
  return { kind, id, name: row.name, haveCents: h.haveCents, targetCents: h.targetCents, settled, overdue: h.overdue };
}

/** Grava o novo saldo (nunca por fora de uma transação de ajuste). */
async function writeBalance(tx: Tx, h: Holding, newCents: Cents) {
  if (h.kind === "goal") {
    await tx.goal.update({ where: { id: h.id }, data: { savedCents: newCents } });
    return;
  }
  const settled = h.settled as EngineBill;
  const next = h.overdue ? { ...settled, consumedCents: newCents } : { ...settled, savedCents: newCents };
  await tx.bill.update({ where: { id: h.id }, data: billCycleData(next) });
}

const itemRef = (h: Pick<Holding, "kind" | "id">) => (h.kind === "bill" ? { billId: h.id } : { goalId: h.id });

/** Corrige o saldo de uma conta ou meta. Vira uma transação `adjustment`; o saldo nunca é editado direto. */
export async function adjustBalanceFor(
  user: BalanceUser,
  kind: BalanceKind,
  id: string,
  input: { newBalanceCents: Cents; reason: AdjustReason },
  today: ISODate,
): Promise<AdjustResult> {
  if (!isAdjustReason(input.reason)) return { ok: false, error: "Motivo inválido." };

  return db.$transaction(async (tx): Promise<AdjustResult> => {
    const h = await loadHolding(tx, user.id, kind, id, today);
    if (!h) return { ok: false, error: NOT_FOUND[kind] };

    // O livre é lido na mesma transação, para a checagem e a gravação não se separarem.
    const week = await weekStats(user.id, today, user.weekStartDay, tx);
    const check = checkAdjustment({
      haveCents: h.haveCents,
      newBalanceCents: input.newBalanceCents,
      reason: input.reason,
      freeLeftCents: week.freeLeftCents,
      maxCents: kind === "bill" ? h.targetCents : undefined,
    });
    if (!check.ok) return check;

    await writeBalance(tx, h, input.newBalanceCents);
    const row = await tx.transaction.create({
      data: {
        userId: user.id,
        type: "adjustment",
        amountCents: check.deltaCents,
        reason: input.reason,
        affectsWeeklyFree: check.affectsWeeklyFree,
        date: toDbDate(today),
        note: h.name,
        balanceAfterCents: input.newBalanceCents,
        ...itemRef(h),
      },
    });
    return { ok: true, adjustmentId: row.id };
  });
}

/** Erro interno para desfazer um lote inteiro ou nada. */
class UndoError extends Error {}

/** Desfaz um ajuste dentro de uma transação já aberta. Lança `UndoError` se não for possível. */
async function undoInTx(tx: Tx, userId: string, adjustmentId: string, today: ISODate) {
  const adj = await tx.transaction.findFirst({ where: { id: adjustmentId, userId, type: "adjustment" } });
  if (!adj) throw new UndoError("Ajuste não encontrado.");
  if (adj.undoneAt) throw new UndoError("Este ajuste já foi desfeito.");

  const kind: BalanceKind | null = adj.billId ? "bill" : adj.goalId ? "goal" : null;
  const itemId = adj.billId ?? adj.goalId;
  if (!kind || !itemId) throw new UndoError("A conta ou meta deste ajuste não existe mais.");

  // Só o último movimento ativo pode ser desfeito: antes dele, o saldo não seria o que o ajuste deixou.
  const later = await tx.transaction.findFirst({
    where: { userId, id: { not: adj.id }, undoneAt: null, createdAt: { gt: adj.createdAt }, ...itemRef({ kind, id: itemId }) },
  });
  if (later) throw new UndoError("Houve outras movimentações depois deste ajuste; não dá para desfazer.");

  const h = await loadHolding(tx, userId, kind, itemId, today);
  if (!h) throw new UndoError(NOT_FOUND[kind]);
  const restored = h.haveCents - adj.amountCents;
  if (restored < 0) throw new UndoError("O saldo atual não permite desfazer este ajuste.");

  await writeBalance(tx, h, restored);
  await tx.transaction.update({ where: { id: adj.id }, data: { undoneAt: new Date() } });
}

/** Desfaz um ajuste: restaura o saldo e o livre; o registro fica no histórico. */
export async function undoAdjustmentFor(user: BalanceUser, adjustmentId: string, today: ISODate): Promise<ActionResult> {
  try {
    await db.$transaction((tx) => undoInTx(tx, user.id, adjustmentId, today));
    return { ok: true };
  } catch (e) {
    if (e instanceof UndoError) return fail(e.message);
    throw e;
  }
}

/** Desfaz de uma vez todos os ajustes de um "Recomeçar saldos". Tudo ou nada. */
export async function undoBatchFor(user: BalanceUser, groupId: string, today: ISODate): Promise<ActionResult> {
  try {
    await db.$transaction(async (tx) => {
      const rows = await tx.transaction.findMany({
        where: { userId: user.id, groupId, type: "adjustment", undoneAt: null },
        select: { id: true },
      });
      if (rows.length === 0) throw new UndoError("Nada para desfazer.");
      for (const r of rows) await undoInTx(tx, user.id, r.id, today);
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof UndoError) return fail(e.message);
    throw e;
  }
}

/**
 * "Recomeçar saldos": zera todas as contas e metas que têm saldo, mantendo nomes, valores,
 * prazos, prioridades e histórico. Um `adjustment` (motivo `reset`) por item, num mesmo grupo.
 */
export async function resetAllBalancesFor(user: BalanceUser, today: ISODate): Promise<ResetResult> {
  return db.$transaction(async (tx): Promise<ResetResult> => {
    const groupId = randomUUID();
    const bills = await tx.bill.findMany({ where: { userId: user.id }, orderBy: { id: "asc" }, select: { id: true } });
    const goals = await tx.goal.findMany({ where: { userId: user.id }, orderBy: { priority: "asc" }, select: { id: true } });
    const holdings: Holding[] = [];
    for (const [kind, rows] of [["bill", bills], ["goal", goals]] as const) {
      for (const r of rows) {
        const h = await loadHolding(tx, user.id, kind, r.id, today);
        if (h && h.haveCents > 0) holdings.push(h);
      }
    }

    for (const h of holdings) {
      await writeBalance(tx, h, 0);
      await tx.transaction.create({
        data: {
          userId: user.id,
          type: "adjustment",
          amountCents: -h.haveCents,
          reason: "reset",
          affectsWeeklyFree: false,
          date: toDbDate(today),
          note: h.name,
          balanceAfterCents: 0,
          groupId,
          ...itemRef(h),
        },
      });
    }
    return { ok: true, count: holdings.length, groupId };
  });
}

// Versões para a sessão atual (usuário único local).
const current = async (): Promise<BalanceUser> => getOrCreateUser();

export async function adjustBalance(kind: BalanceKind, id: string, input: { newBalanceCents: Cents; reason: AdjustReason }, today: ISODate) {
  return adjustBalanceFor(await current(), kind, id, input, today);
}
export async function undoAdjustment(adjustmentId: string, today: ISODate) {
  return undoAdjustmentFor(await current(), adjustmentId, today);
}
export async function undoBatch(groupId: string, today: ISODate) {
  return undoBatchFor(await current(), groupId, today);
}
export async function resetAllBalances(today: ISODate) {
  return resetAllBalancesFor(await current(), today);
}

/** Quanto ainda há de livre na semana (para a folha "Ajustar saldo" bloquear "tirar do livre"). */
export async function getFreeLeft(today: ISODate): Promise<Cents> {
  const user = await getOrCreateUser();
  return (await weekStats(user.id, today, user.weekStartDay)).freeLeftCents;
}
