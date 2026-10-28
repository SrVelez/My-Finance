import { formatEUR } from "@/lib/money";
import type { DashBill, Dashboard } from "./types";

/** Quanto das contas fixas do próximo vencimento já está guardado. */
export function buildCobertura(bills: DashBill[]): Dashboard["proximoMes"] {
  const totalCents = bills.reduce((s, b) => s + b.targetCents, 0);
  const guardadoCents = bills.reduce((s, b) => s + Math.min(b.savedCents, b.targetCents), 0);
  const faltaCents = totalCents - guardadoCents;
  // O vencimento mais próximo que ainda precisa de dinheiro é o que limita o prazo.
  const abertas = bills.filter((b) => b.savedCents < b.targetCents);
  const recebimentosRestantes = abertas.length ? Math.min(...abertas.map((b) => b.receiptsLeft)) : 0;

  let frase: string;
  if (totalCents === 0) {
    frase = "Nenhuma conta fixa ainda.";
  } else if (faltaCents === 0) {
    frase = "100% coberto · tudo guardado.";
  } else {
    const pct = Math.floor((guardadoCents / totalCents) * 100);
    const n = recebimentosRestantes;
    frase = `${pct}% coberto · faltam ${formatEUR(faltaCents)} em ${n} ${n === 1 ? "recebimento" : "recebimentos"}.`;
  }
  return { totalCents, guardadoCents, faltaCents, recebimentosRestantes, frase };
}
