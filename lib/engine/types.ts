import type { Cents } from "@/lib/money";

/** Datas são strings ISO `yyyy-mm-dd` (sem fuso); prazos de meta são `yyyy-mm`. */
export type ISODate = string;

export interface EngineBill {
  id: string;
  name: string;
  amountCents: Cents;
  dueDay: number;
  /** Saldo guardado no ciclo atual. */
  savedCents: Cents;
  /** Último vencimento já considerado pago; null = nenhum. */
  paidThrough: ISODate | null;
  /** Saldo consumido ao considerar o vencimento pago (permite reverter). */
  consumedCents: Cents;
  /** Vencimento marcado como "Não foi pago" (continua devendo). */
  unpaidDue: ISODate | null;
  /** Dia em que a conta foi criada: vencimentos anteriores a ele não contam. */
  createdOn: ISODate;
}

export interface EngineGoal {
  id: string;
  name: string;
  targetCents: Cents;
  savedCents: Cents;
  /** `yyyy-mm` ou null. */
  deadline: string | null;
  /** Valor semanal definido pelo usuário (metas sem prazo). */
  weeklyCents: Cents;
  /** Ordem de prioridade; menor recebe primeiro. */
  priority: number;
  isEmergency: boolean;
}

export interface EngineState {
  bills: EngineBill[];
  goals: EngineGoal[];
  weeklyLivingCents: Cents;
}

export interface DistributeInput {
  incomeCents: Cents;
  date: ISODate;
  state: EngineState;
  /** Prévia do onboarding: trata todas as contas como um ciclo novo de 4 semanas. */
  assumeFreshCycle?: boolean;
}

export interface Allocation {
  kind: "bill" | "goal";
  id: string;
  name: string;
  amountCents: Cents;
  reason: string;
}

export interface Distribution {
  allocations: Allocation[];
  billsCents: Cents;
  goalsCents: Cents;
  /** Total a guardar (contas + metas). */
  toSaveCents: Cents;
  livingCents: Cents;
  /** Quanto faltou para completar o gasto semanal. */
  shortfallCents: Cents;
  /** Sobra do dinheiro após tudo. */
  slackCents: Cents;
  /** Livre para gastar = dia a dia + folga. */
  freeCents: Cents;
}
