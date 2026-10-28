import { addDays } from "@/lib/engine";
import { euros } from "@/lib/money";
import type { DashTx } from "@/lib/dashboard/types";

/** Estado base do projeto: contas €196/semana, dia a dia €120, metas €58. */
export const BASE = { contas: euros(196), diaADia: euros(120), metas: euros(58) };

/** Recebimentos do seed: 8 semanas a partir de 1/set/2026. */
export const RECEBIDOS = [500, 450, 500, 280, 500, 520, 480, 500].map(euros);
export const SEMANA_1 = "2026-09-01";

let seq = 0;
const id = () => `tx${++seq}`;

/** Um recebimento com as alocações que o motor geraria (contas, depois metas; nunca passa do recebido). */
export function recebimento(date: string, incomeCents: number, groupId = `g-${date}`): DashTx[] {
  const contas = Math.min(BASE.contas, incomeCents);
  const dia = Math.min(BASE.diaADia, incomeCents - contas);
  const metas = Math.min(BASE.metas, incomeCents - contas - dia);
  const falta = BASE.diaADia - dia;
  const row = (type: string, amountCents: number, category: string | null = null, shortfallCents: number | null = null): DashTx => ({
    id: id(),
    type,
    amountCents,
    category,
    date,
    groupId,
    shortfallCents,
    note: null,
  });
  return [
    row("income", incomeCents, null, falta),
    ...(contas > 0 ? [row("allocation", contas, "conta")] : []),
    ...(metas > 0 ? [row("allocation", metas, "meta")] : []),
  ];
}

export const gasto = (date: string, cents: number, category: string): DashTx => ({
  id: id(),
  type: "expense",
  amountCents: cents,
  category,
  date,
  groupId: null,
  shortfallCents: null,
  note: null,
});

/** As semanas do seed (8 por padrão), um recebimento por semana (terça-feira). */
export const seedTxs = (semanas = RECEBIDOS.length): DashTx[] =>
  RECEBIDOS.slice(0, semanas).flatMap((cents, i) => recebimento(addDays(SEMANA_1, 7 * i), cents));
