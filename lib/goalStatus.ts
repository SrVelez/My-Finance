import { formatMonthYear } from "@/lib/engine";
import type { GoalView } from "@/lib/services/goals";

/** Texto e cor do status de uma meta (lista e detalhe). */
export function goalStatus(g: GoalView): { text: string; tone: string } {
  if (g.complete) return { text: "✓ Meta completa", tone: "text-brand font-semibold" };
  if (g.deadline) {
    return g.pastDeadline
      ? { text: `Prazo de ${formatMonthYear(g.deadline)} venceu · escolha o que fazer`, tone: "text-warn-ink font-semibold" }
      : {
          text: `✓ No ritmo para ${formatMonthYear(g.deadline)}${g.deadlineWeeks !== null && g.deadlineWeeks <= 8 ? ` · faltam ${g.deadlineWeeks} ${g.deadlineWeeks === 1 ? "semana" : "semanas"}` : ""}`,
          tone: "text-brand font-semibold",
        };
  }
  return {
    text: g.weeksLeft ? `Sem prazo · completa em cerca de ${g.weeksLeft} semanas` : "Sem prazo · defina um valor semanal",
    tone: "text-muted",
  };
}
