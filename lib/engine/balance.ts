import { formatEUR, type Cents } from "@/lib/money";
import { MAX_CENTS } from "@/lib/validate";
import { lastDueOnOrBefore } from "./dates";
import { openDueAmount, planBill, settleBill } from "./bills";
import { planGoal } from "./goals";
import type { EngineBill, EngineGoal, ISODate } from "./types";
import type { WeekTx } from "./week";

/** Por que o saldo de uma conta ou meta foi corrigido à mão. */
export const ADJUST_REASONS = ["match_bank", "from_free", "reset", "used", "return_to_free"] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number];

export const isAdjustReason = (v: unknown): v is AdjustReason => ADJUST_REASONS.some((r) => r === v);

/** Transação como o motor a enxerga ao somar a semana. */
export interface BalanceTx extends WeekTx {
  /** Só em `adjustment`. */
  affectsWeeklyFree?: boolean;
  /** Só em `adjustment`: desfeito, não conta mais. */
  undoneAt?: Date | string | null;
}

/**
 * Traduz as transações para o que `weekPool` entende, sem mudar a fórmula do livre:
 * - saldo inicial não é receita nem alocação: passa direto e `weekPool` o ignora;
 * - ajuste que aumenta o saldo tirando do livre vale como "guardar";
 * - ajuste que diminui devolvendo ao livre vale como "retirar";
 * - ajuste que não afeta o livre e ajuste desfeito somem.
 */
export function weekTxsOf(txs: BalanceTx[]): WeekTx[] {
  const out: WeekTx[] = [];
  for (const t of txs) {
    if (t.undoneAt) continue;
    if (t.type !== "adjustment") {
      out.push(t);
    } else if (t.affectsWeeklyFree) {
      out.push(
        t.amountCents > 0
          ? { type: "allocation", amountCents: t.amountCents }
          : { type: "withdrawal", amountCents: -t.amountCents },
      );
    }
  }
  return out;
}

/** O "saldo" de uma conta (o mesmo que a tela mostra): guardado do ciclo, ou o retido se há atraso. */
export function billHolding(bill: EngineBill): { overdue: boolean; targetCents: Cents; haveCents: Cents } {
  const overdue = !!bill.unpaidDue;
  return {
    overdue,
    targetCents: overdue ? openDueAmount(bill) : bill.amountCents,
    haveCents: overdue ? bill.consumedCents : bill.savedCents,
  };
}

export interface AdjustCheckInput {
  haveCents: Cents;
  newBalanceCents: Cents;
  reason: AdjustReason;
  /** Quanto ainda há de livre na semana. */
  freeLeftCents: Cents;
  /** Teto do novo saldo (contas: o valor do vencimento). */
  maxCents?: Cents;
}

export type AdjustCheck =
  | { ok: true; deltaCents: Cents; affectsWeeklyFree: boolean }
  | { ok: false; error: string };

/** Valida um ajuste de saldo e diz se ele mexe no livre da semana. */
export function checkAdjustment({ haveCents, newBalanceCents, reason, freeLeftCents, maxCents }: AdjustCheckInput): AdjustCheck {
  if (!Number.isInteger(newBalanceCents) || newBalanceCents < 0 || newBalanceCents > MAX_CENTS) {
    return { ok: false, error: "Informe um valor válido." };
  }
  if (maxCents !== undefined && newBalanceCents > maxCents) {
    return { ok: false, error: `O valor guardado não pode passar de ${formatEUR(maxCents)}.` };
  }
  const deltaCents = newBalanceCents - haveCents;
  if (deltaCents === 0) return { ok: false, error: `O saldo já é ${formatEUR(haveCents)}.` };

  if (reason === "reset" && newBalanceCents !== 0) {
    return { ok: false, error: "Para zerar, o novo saldo precisa ser €0." };
  }
  if (deltaCents < 0 && reason === "from_free") {
    return { ok: false, error: "Esse motivo só vale quando o saldo aumenta." };
  }
  if (deltaCents > 0 && reason !== "match_bank" && reason !== "from_free") {
    return { ok: false, error: "Esse motivo só vale quando o saldo diminui." };
  }
  if (reason === "from_free" && deltaCents > freeLeftCents) {
    return { ok: false, error: `Você só tem ${formatEUR(Math.max(freeLeftCents, 0))} livres esta semana.` };
  }
  return { ok: true, deltaCents, affectsWeeklyFree: reason === "from_free" || reason === "return_to_free" };
}

/** Como a pessoa começa uma conta: do zero, com uma parte guardada ou já paga neste mês. */
export type BillOpeningInput = { mode: "none" } | { mode: "partial"; cents: Cents } | { mode: "paid" };

export type BillOpeningCheck =
  | { ok: true; savedCents: Cents; paidBefore: boolean }
  | { ok: false; error: string };

/** Valida o saldo inicial de uma conta fixa nova. */
export function checkBillOpening(
  opening: BillOpeningInput,
  amountCents: Cents,
  dueDay: number,
  today: ISODate,
): BillOpeningCheck {
  if (opening.mode === "none") return { ok: true, savedCents: 0, paidBefore: false };

  if (opening.mode === "paid") {
    // Só faz sentido se o vencimento deste mês já passou ou é hoje.
    if (lastDueOnOrBefore(dueDay, today).slice(0, 7) !== today.slice(0, 7)) {
      return { ok: false, error: "O vencimento deste mês ainda não chegou." };
    }
    return { ok: true, savedCents: 0, paidBefore: true };
  }

  const { cents } = opening;
  if (!Number.isInteger(cents) || cents < 0) return { ok: false, error: "Informe um valor maior ou igual a zero." };
  if (cents > amountCents) return { ok: false, error: `O valor guardado não pode passar de ${formatEUR(amountCents)}.` };
  return { ok: true, savedCents: cents, paidBefore: false };
}

export type GoalOpeningCheck =
  | { ok: true; savedCents: Cents; completes: boolean }
  | { ok: false; error: string };

/** Valida o saldo inicial de uma meta nova. Passar do alvo é permitido: a meta já nasce concluída. */
export function checkGoalOpening(cents: Cents, targetCents: Cents): GoalOpeningCheck {
  if (!Number.isInteger(cents) || cents < 0) return { ok: false, error: "Informe um valor maior ou igual a zero." };
  if (cents > MAX_CENTS) return { ok: false, error: "Valor muito alto." };
  return { ok: true, savedCents: cents, completes: targetCents > 0 && cents >= targetCents };
}

/** O que muda no plano quando o saldo é corrigido (para a prévia da folha "Ajustar saldo"). */
export interface AdjustPreview {
  pctBefore: number;
  pctAfter: number;
  /** Quanto o plano separa por recebimento/semana antes e depois. */
  weeklyBeforeCents: Cents;
  weeklyAfterCents: Cents;
  /** Quanto falta guardar antes e depois. */
  faltaBeforeCents: Cents;
  faltaAfterCents: Cents;
}

const pctOf = (part: Cents, total: Cents) => (total > 0 ? Math.min(100, Math.round((part / total) * 100)) : 0);

export function previewGoalAdjustment(goal: EngineGoal, newCents: Cents, today: ISODate): AdjustPreview {
  const after = { ...goal, savedCents: newCents };
  return {
    pctBefore: pctOf(goal.savedCents, goal.targetCents),
    pctAfter: pctOf(newCents, goal.targetCents),
    weeklyBeforeCents: planGoal(goal, today).amountCents,
    weeklyAfterCents: planGoal(after, today).amountCents,
    faltaBeforeCents: Math.max(0, goal.targetCents - goal.savedCents),
    faltaAfterCents: Math.max(0, goal.targetCents - newCents),
  };
}

export function previewBillAdjustment(bill: EngineBill, newCents: Cents, today: ISODate): AdjustPreview {
  const settled = settleBill(bill, today);
  const h = billHolding(settled);
  const after = h.overdue ? { ...settled, consumedCents: newCents } : { ...settled, savedCents: newCents };
  return {
    pctBefore: pctOf(h.haveCents, h.targetCents),
    pctAfter: pctOf(newCents, h.targetCents),
    weeklyBeforeCents: planBill(settled, today).amountCents,
    weeklyAfterCents: planBill(after, today).amountCents,
    faltaBeforeCents: Math.max(0, h.targetCents - h.haveCents),
    faltaAfterCents: Math.max(0, h.targetCents - newCents),
  };
}
