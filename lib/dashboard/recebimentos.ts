import { formatDayMonth, weekRange } from "@/lib/engine";
import type { Cents } from "@/lib/money";
import type { Dashboard, DashTx, DetalheItem } from "./types";

export type Recebimento = NonNullable<Dashboard["recebimentos"]>[number];

const sum = (txs: DashTx[]) => txs.reduce((s, t) => s + t.amountCents, 0);

/**
 * Para onde foi cada recebimento: contas, dia a dia, metas e folga.
 * O gasto semanal do dia a dia não é guardado por recebimento; vale o atual,
 * e a falta (quando registrada) diz quanto dele não foi coberto.
 */
export function buildRecebimentos(txs: DashTx[], weeklyLivingCents: Cents, weekStartDay: number): Recebimento[] {
  const incomes = txs.filter((t) => t.type === "income").sort((a, b) => a.date.localeCompare(b.date));

  return incomes.map((income) => {
    const group = income.groupId ? txs.filter((t) => t.groupId === income.groupId && t.type !== "income") : [];
    const contasCents = sum(group.filter((t) => t.type === "allocation" && t.category === "conta"));
    const metasCents = sum(group.filter((t) => t.type === "allocation" && t.category === "meta"));
    const retiradoCents = sum(group.filter((t) => t.type === "withdrawal"));

    const disponivel = Math.max(0, income.amountCents - contasCents - metasCents + retiradoCents);
    const diaADiaCents = Math.min(weeklyLivingCents, disponivel);
    const faltaCents = income.shortfallCents ?? weeklyLivingCents - diaADiaCents;

    const week = weekRange(income.date, weekStartDay);
    return {
      semanaInicio: week.start,
      recebidoCents: income.amountCents,
      contasCents,
      diaADiaCents,
      metasCents,
      folgaCents: disponivel - diaADiaCents,
      faltaCents,
      detalhe: detalheDaSemana(txs, week.start, week.end),
    };
  });
}

function detalheDaSemana(txs: DashTx[], inicio: string, fim: string): DetalheItem[] {
  return txs
    .filter((t) => (t.type === "income" || t.type === "expense") && t.date >= inicio && t.date <= fim)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => ({
      data: t.date,
      rotulo: t.type === "income" ? "Recebi" : (t.category ?? "Gasto"),
      cents: t.amountCents,
      sinal: t.type === "income" ? 1 : -1,
    }));
}

/** Frase do card: avisa a primeira semana apertada mais recente. */
export function recebimentosFrase(rows: Recebimento[]): string {
  const apertada = [...rows].reverse().find((r) => r.faltaCents > 0);
  if (apertada) return `Na semana de ${formatDayMonth(apertada.semanaInicio)} não deu para tudo.`;
  return rows.length === 0 ? "Nenhum recebimento neste período." : "Todos os recebimentos cobriram o planejado.";
}
