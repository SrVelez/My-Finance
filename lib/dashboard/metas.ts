import { daysBetween, deadlinePassed, formatMonthYear, weeksUntilDeadline, type ISODate } from "@/lib/engine";
import { formatEUR, type Cents } from "@/lib/money";
import type { DashGoal, Dashboard } from "./types";

type MetaView = Dashboard["metas"][number];

const pct = (part: Cents, total: Cents) => (total > 0 ? Math.min(100, Math.round((part / total) * 100)) : 0);

/** Progresso de cada meta (por prioridade) contra o ritmo esperado até o prazo. */
export function buildMetas(goals: DashGoal[], today: ISODate): MetaView[] {
  return [...goals].sort((a, b) => a.priority - b.priority).map((g) => buildMeta(g, today));
}

function buildMeta(g: DashGoal, today: ISODate): MetaView {
  const base = { id: g.id, nome: g.name, pct: pct(g.savedCents, g.targetCents) };
  const falta = Math.max(0, g.targetCents - g.savedCents);

  if (falta === 0) return { ...base, pct: 100, esperadoPct: null, status: "concluida", frase: "Meta concluída" };

  if (!g.deadline) {
    const frase =
      g.weeklyCents > 0
        ? `Sem prazo · cerca de ${Math.ceil(falta / g.weeklyCents)} semanas`
        : "Sem prazo · defina um valor semanal";
    return { ...base, esperadoPct: null, status: "sem_prazo", frase };
  }

  if (deadlinePassed(g.deadline, today)) {
    return {
      ...base,
      esperadoPct: 100,
      status: "atrasada",
      frase: `Prazo de ${formatMonthYear(g.deadline)} venceu · faltam ${formatEUR(falta)}`,
    };
  }

  // Esperado: semanas desde a criação ÷ semanas totais até o prazo.
  const totalWeeks = weeksUntilDeadline(g.createdOn, g.deadline);
  const elapsedWeeks = Math.max(0, daysBetween(g.createdOn, today)) / 7;
  const expectedFraction = Math.min(1, elapsedWeeks / totalWeeks);
  const expectedCents = Math.round(g.targetCents * expectedFraction);
  const esperadoPct = Math.round(expectedFraction * 100);

  if (g.savedCents >= expectedCents) {
    return { ...base, esperadoPct, status: "no_ritmo", frase: `No ritmo para ${formatMonthYear(g.deadline)}` };
  }

  const atraso = expectedCents - g.savedCents;
  const weeksLeft = weeksUntilDeadline(today, g.deadline);
  const extraPerWeek = Math.ceil(atraso / weeksLeft / 100) * 100;
  return {
    ...base,
    esperadoPct,
    status: "atrasada",
    frase: `${formatEUR(atraso)} atrás · +${formatEUR(extraPerWeek)}/semana resolve`,
  };
}
