import type { Cents } from "@/lib/money";

export type Periodo = "semana" | "mes" | "3meses";
export const PERIODOS: readonly Periodo[] = ["semana", "mes", "3meses"];

/** Mínimo de recebimentos para os gráficos de tendência fazerem sentido. */
export const MIN_RECEBIMENTOS = 3;

type MetaStatus = "no_ritmo" | "atrasada" | "sem_prazo" | "concluida";

export interface DetalheItem {
  data: string;
  rotulo: string;
  cents: Cents;
  /** 1 = entrou, -1 = saiu. */
  sinal: 1 | -1;
}

export interface Dashboard {
  periodo: Periodo;
  intervalo: { inicio: string; fim: string };
  destaques: { recebidoCents: Cents; guardadoPct: number; semanasApertadas: number; semanasTotais: number };
  ritmoSemana?: {
    dias: { data: string; gastoAcumuladoCents: Cents | null; idealCents: Cents }[];
    livreCents: Cents;
    frase: string;
  };
  recebimentos?: {
    semanaInicio: string;
    recebidoCents: Cents;
    contasCents: Cents;
    diaADiaCents: Cents;
    metasCents: Cents;
    folgaCents: Cents;
    faltaCents: Cents;
    /** Recebimentos e gastos da semana, para o toque na barra. */
    detalhe: DetalheItem[];
  }[];
  recebimentosFrase?: string;
  metas: {
    id: string;
    nome: string;
    pct: number;
    esperadoPct: number | null;
    status: MetaStatus;
    frase: string;
  }[];
  categorias?: { categoria: string; totalCents: Cents; pct: number }[];
  categoriasFrase?: string;
  proximoMes: {
    totalCents: Cents;
    guardadoCents: Cents;
    faltaCents: Cents;
    recebimentosRestantes: number;
    frase: string;
  };
  dadosSuficientes: { tendencias: boolean; recebimentosTotais: number };
}

/** Transação já lida do banco (datas em `yyyy-mm-dd`). */
export interface DashTx {
  id: string;
  type: string;
  amountCents: Cents;
  category: string | null;
  date: string;
  groupId: string | null;
  shortfallCents: Cents | null;
  note: string | null;
}

export interface DashGoal {
  id: string;
  name: string;
  targetCents: Cents;
  savedCents: Cents;
  /** `yyyy-mm` ou null. */
  deadline: string | null;
  weeklyCents: Cents;
  priority: number;
  /** `yyyy-mm-dd` */
  createdOn: string;
}

export interface DashBill {
  /** Quanto falta guardar para o próximo vencimento: alvo e já guardado. */
  targetCents: Cents;
  savedCents: Cents;
  receiptsLeft: number;
}
