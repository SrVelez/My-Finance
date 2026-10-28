import type { Cents } from "@/lib/money";

/** O mínimo que o motor precisa saber de uma transação para somar a semana. */
export interface WeekTx {
  type: string;
  amountCents: Cents;
}

const sumOf = (txs: WeekTx[], type: string): Cents =>
  txs.filter((t) => t.type === type).reduce((s, t) => s + t.amountCents, 0);

/** Dinheiro livre da semana: recebido − guardado + retirado de metas. */
export const weekPool = (txs: WeekTx[]): Cents => sumOf(txs, "income") - sumOf(txs, "allocation") + sumOf(txs, "withdrawal");

/** Total gasto na semana (despesas). */
export const weekSpent = (txs: WeekTx[]): Cents => sumOf(txs, "expense");
