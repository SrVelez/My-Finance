import { formatEUR, roundToEuro, type Cents } from "@/lib/money";
import { deadlinePassed, formatMonthYear, weeksUntilDeadline } from "./dates";
import type { EngineGoal, ISODate } from "./types";

export interface GoalPlan {
  amountCents: Cents;
  reason: string;
}

export function planGoal(goal: EngineGoal, today: ISODate): GoalPlan {
  const falta = Math.max(0, goal.targetCents - goal.savedCents);
  if (falta === 0) return { amountCents: 0, reason: "Meta completa" };

  if (goal.deadline) {
    // Prazo vencido: pausa em vez de tentar separar tudo de uma vez; o usuário decide o que fazer.
    if (deadlinePassed(goal.deadline, today)) {
      return { amountCents: 0, reason: `Prazo de ${formatMonthYear(goal.deadline)} venceu · escolha o que fazer` };
    }
    const weeks = weeksUntilDeadline(today, goal.deadline);
    return {
      amountCents: Math.min(falta, roundToEuro(falta / weeks)),
      reason: `Faltam ${formatEUR(falta)} até ${formatMonthYear(goal.deadline)}`,
    };
  }
  return {
    amountCents: Math.min(falta, goal.weeklyCents),
    reason: "Valor semanal que você definiu",
  };
}

/** Sugestão padrão sem prazo: valor redondo que completa em ~16 semanas. */
export function suggestWeekly(targetCents: Cents): Cents {
  const step = 500; // €5
  return Math.max(step, Math.round(targetCents / 16 / step) * step);
}
