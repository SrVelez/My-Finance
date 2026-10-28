import type { Cents } from "@/lib/money";
import { planBill, settleBill } from "./bills";
import { planGoal } from "./goals";
import type { Allocation, DistributeInput, Distribution, EngineGoal } from "./types";

/**
 * Motor de distribuição. Puro: não altera `input` nem lê relógio/banco.
 * Ordem fixa: contas → gasto da semana → metas (prioridade) → folga.
 */
export function distribute({
  incomeCents,
  date,
  state,
  assumeFreshCycle = false,
}: DistributeInput): Distribution {
  let remaining = incomeCents;
  const allocations: Allocation[] = [];
  let billsCents = 0;
  let goalsCents = 0;

  for (const original of state.bills) {
    const bill = settleBill(original, date);
    const plan = planBill(bill, date, assumeFreshCycle);
    const amount = Math.min(plan.amountCents, remaining);
    remaining -= amount;
    billsCents += amount;
    allocations.push({
      kind: "bill",
      id: bill.id,
      name: bill.name,
      amountCents: amount,
      reason: amount < plan.amountCents ? "Dinheiro insuficiente para a conta toda" : plan.reason,
    });
  }

  const livingCents = Math.min(state.weeklyLivingCents, remaining);
  const shortfallCents = state.weeklyLivingCents - livingCents;
  remaining -= livingCents;

  const goals = [...state.goals].sort((a, b) => a.priority - b.priority);
  for (const goal of goals) {
    const plan = planGoal(goal, date);
    const amount = Math.min(plan.amountCents, remaining);
    remaining -= amount;
    goalsCents += amount;
    allocations.push({
      kind: "goal",
      id: goal.id,
      name: goal.name,
      amountCents: amount,
      reason: plan.amountCents > 0 && amount === 0 ? "Pausada nesta semana" : plan.reason,
    });
  }

  return {
    allocations,
    billsCents,
    goalsCents,
    toSaveCents: billsCents + goalsCents,
    livingCents,
    shortfallCents,
    slackCents: remaining,
    freeCents: livingCents + remaining,
  };
}

export interface ReserveCover {
  freeCents: Cents;
  withdrawalCents: Cents;
  reserveBeforeCents: Cents;
  reserveAfterCents: Cents;
  goalId: string | null;
}

/** Opção A: usa a reserva de emergência para completar o dia a dia. */
export function coverShortfallFromReserve(dist: Distribution, goals: EngineGoal[]): ReserveCover {
  const reserve = goals.find((g) => g.isEmergency);
  const available = reserve?.savedCents ?? 0;
  const withdrawalCents = Math.min(dist.shortfallCents, available);
  return {
    freeCents: dist.freeCents + withdrawalCents,
    withdrawalCents,
    reserveBeforeCents: available,
    reserveAfterCents: available - withdrawalCents,
    goalId: reserve?.id ?? null,
  };
}

/** "Gastei": quanto sobra livre na semana depois de uma despesa. */
export const freeAfterExpense = (freeCents: Cents, expenseCents: Cents): Cents =>
  freeCents - expenseCents;

export interface AllocationPreview {
  /** Soma do que será guardado (contas + metas). */
  toSaveCents: Cents;
  /** Livre para gastar = recebido − guardado (negativo se os valores passam do recebido). */
  freeCents: Cents;
  /** Parte do livre que cobre o dia a dia (no máximo o gasto semanal). */
  livingCents: Cents;
  /** Os valores passam do que foi recebido. */
  over: boolean;
}

/** "Ajustar": recalcula o resumo quando o usuário edita os valores sugeridos (só pré-visualização). */
export function previewAllocations(
  incomeCents: Cents,
  amountsCents: Cents[],
  weeklyLivingCents: Cents,
): AllocationPreview {
  const toSaveCents = amountsCents.reduce((s, a) => s + a, 0);
  const freeCents = incomeCents - toSaveCents;
  return {
    toSaveCents,
    freeCents,
    livingCents: Math.min(weeklyLivingCents, Math.max(freeCents, 0)),
    over: freeCents < 0,
  };
}
