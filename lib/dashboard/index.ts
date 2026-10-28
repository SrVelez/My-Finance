import { weekRange, type ISODate } from "@/lib/engine";
import type { Cents } from "@/lib/money";
import { buildCategorias, categoriasFrase } from "./categorias";
import { buildCobertura } from "./cobertura";
import { buildDestaques } from "./destaques";
import { buildMetas } from "./metas";
import { intervaloAnterior, intervaloDo, noIntervalo } from "./periodo";
import { buildRecebimentos, recebimentosFrase } from "./recebimentos";
import { buildRitmo } from "./ritmo";
import type { DashBill, DashGoal, DashTx, Dashboard, Periodo } from "./types";

/** Mínimo de recebimentos para os gráficos de tendência fazerem sentido. */
export const MIN_RECEBIMENTOS = 3;

export interface DashboardInput {
  periodo: Periodo;
  today: ISODate;
  weekStartDay: number;
  weeklyLivingCents: Cents;
  /** Todas as transações do usuário (ou ao menos desde o início do período anterior). */
  txs: DashTx[];
  goals: DashGoal[];
  bills: DashBill[];
  /** Total de recebimentos já feitos; padrão: os que aparecem em `txs`. */
  recebimentosTotais?: number;
}

/** Monta o Dashboard inteiro; puro, só combina as agregações. */
export function buildDashboard(input: DashboardInput): Dashboard {
  const { periodo, today, weekStartDay, weeklyLivingCents, txs, goals, bills } = input;
  const intervalo = intervaloDo(periodo, today, weekStartDay);
  const noPeriodo = txs.filter((t) => noIntervalo(t.date, intervalo));

  const recebimentos = buildRecebimentos(noPeriodo, weeklyLivingCents, weekStartDay);
  const recebimentosTotais = input.recebimentosTotais ?? txs.filter((t) => t.type === "income").length;

  const dashboard: Dashboard = {
    periodo,
    intervalo: { inicio: intervalo.inicio, fim: intervalo.fim },
    destaques: buildDestaques(recebimentos, periodo),
    metas: buildMetas(goals, today),
    proximoMes: buildCobertura(bills),
    dadosSuficientes: { tendencias: recebimentosTotais >= MIN_RECEBIMENTOS, recebimentosTotais },
  };

  if (periodo === "semana") {
    const week = weekRange(today, weekStartDay);
    dashboard.ritmoSemana = buildRitmo(noPeriodo, week.start, today);
  } else {
    dashboard.recebimentos = recebimentos;
    dashboard.recebimentosFrase = recebimentosFrase(recebimentos);
    const categorias = buildCategorias(noPeriodo);
    const anterior = txs.filter((t) => noIntervalo(t.date, intervaloAnterior(intervalo, periodo)));
    dashboard.categorias = categorias;
    dashboard.categoriasFrase = categoriasFrase(categorias, anterior);
  }
  return dashboard;
}
