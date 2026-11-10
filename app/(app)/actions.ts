"use server";

import { revalidatePath } from "next/cache";
import { isAdjustReason } from "@/lib/engine";
import { adjustBalance, resetAllBalances, undoAdjustment, undoBatch, type AdjustResult, type ResetResult } from "@/lib/services/balance";
import { moveBillMoney } from "@/lib/services/bills";
import { moveGoalMoney } from "@/lib/services/goals";
import { fail, type ActionResult } from "@/lib/result";
import { serverToday } from "@/lib/services/today";
import { requireUser } from "@/lib/auth/session";
import { assertCents, RESET_WORD } from "@/lib/validate";

/** Guardar (do livre) ou retirar (para o livre) dinheiro de uma conta ou meta, à mão. */
export async function moveMoneyAction(
  kind: "bill" | "goal",
  id: string,
  direction: "in" | "out",
  cents: number,
): Promise<ActionResult> {
  if ((kind !== "bill" && kind !== "goal") || (direction !== "in" && direction !== "out") || typeof id !== "string") {
    return fail("Pedido inválido.");
  }
  const { userId } = await requireUser();
  try {
    const today = await serverToday();
    const result = kind === "bill" ? await moveBillMoney(userId, id, direction, cents, today) : await moveGoalMoney(userId, id, direction, cents, today);
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch {
    return fail("Não foi possível movimentar. Tente de novo.");
  }
}

/**
 * Corrige o saldo de uma conta ou meta para o valor informado. O saldo nunca é editado direto:
 * vira um ajuste no histórico, que pode ser desfeito.
 */
export async function adjustBalanceAction(
  kind: "bill" | "goal",
  id: string,
  newBalanceCents: number,
  reason: string,
): Promise<AdjustResult> {
  if ((kind !== "bill" && kind !== "goal") || typeof id !== "string" || !isAdjustReason(reason)) {
    return { ok: false, error: "Pedido inválido." };
  }
  const { userId } = await requireUser();
  try {
    const result = await adjustBalance(userId, kind, id, { newBalanceCents: assertCents(newBalanceCents), reason }, await serverToday());
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch {
    return { ok: false, error: "Não foi possível ajustar. Tente de novo." };
  }
}

/** Desfaz um ajuste de saldo: restaura o saldo e o livre; o registro fica no histórico. */
export async function undoAdjustmentAction(adjustmentId: string): Promise<ActionResult> {
  if (typeof adjustmentId !== "string") return fail("Pedido inválido.");
  const { userId } = await requireUser();
  try {
    const result = await undoAdjustment(userId, adjustmentId, await serverToday());
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch {
    return fail("Não foi possível desfazer. Tente de novo.");
  }
}

/**
 * "Recomeçar saldos": zera todas as contas e metas, mantendo configuração e histórico.
 * Diferente de "Apagar todos os dados". A confirmação digitada também é conferida aqui.
 */
export async function resetAllBalancesAction(confirmation: string): Promise<ResetResult> {
  if (confirmation !== RESET_WORD) return { ok: false, error: `Digite ${RESET_WORD} para confirmar.` };
  const { userId } = await requireUser();
  try {
    const result = await resetAllBalances(userId, await serverToday());
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch {
    return { ok: false, error: "Não foi possível zerar os saldos. Tente de novo." };
  }
}

/** Desfaz de uma vez o último "Recomeçar saldos" (todos os ajustes do mesmo grupo). */
export async function undoBatchAction(groupId: string): Promise<ActionResult> {
  if (typeof groupId !== "string") return fail("Pedido inválido.");
  const { userId } = await requireUser();
  try {
    const result = await undoBatch(userId, groupId, await serverToday());
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch {
    return fail("Não foi possível desfazer. Tente de novo.");
  }
}
