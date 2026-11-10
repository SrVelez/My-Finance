import { addDays, weekPool, weekTxsOf, type ISODate } from "@/lib/engine";
import { formatEUR, roundToEuro } from "@/lib/money";
import type { Dashboard, DashTx } from "./types";

type Ritmo = NonNullable<Dashboard["ritmoSemana"]>;

/** Gasto acumulado por dia contra o ritmo ideal (linear de €0 até o livre da semana). */
export function buildRitmo(weekTxs: DashTx[], weekStart: ISODate, today: ISODate): Ritmo {
  const livreCents = weekPool(weekTxsOf(weekTxs));
  const expenses = weekTxs.filter((t) => t.type === "expense");

  const dias = Array.from({ length: 7 }, (_, i) => {
    const data = addDays(weekStart, i);
    const acumulado = expenses.filter((t) => t.date <= data).reduce((s, t) => s + t.amountCents, 0);
    return {
      data,
      gastoAcumuladoCents: data <= today ? acumulado : null,
      idealCents: roundToEuro((Math.max(livreCents, 0) * (i + 1)) / 7),
    };
  });

  const hoje = dias.find((d) => d.data === today) ?? dias[dias.length - 1];
  const gasto = hoje.gastoAcumuladoCents ?? 0;
  const diasRestantes = dias.filter((d) => d.data > today).length;

  let frase: string;
  if (livreCents <= 0 && gasto === 0) {
    frase = "Ainda não há livre nesta semana. Toque em Recebi para começar.";
  } else if (gasto > livreCents) {
    frase = `Você passou ${formatEUR(gasto - livreCents)} do livre da semana.`;
  } else if (gasto > hoje.idealCents) {
    const porDia = Math.floor((livreCents - gasto) / Math.max(1, diasRestantes) / 100) * 100;
    frase = `Você está ${formatEUR(gasto - hoje.idealCents)} acima do ritmo. Para fechar a semana, dá para gastar ${formatEUR(porDia)} por dia.`;
  } else if (gasto === hoje.idealCents) {
    frase = `Você gastou ${formatEUR(gasto)} de ${formatEUR(livreCents)}. Está no ritmo.`;
  } else {
    frase = `Você gastou ${formatEUR(gasto)} de ${formatEUR(livreCents)}. Está abaixo do ritmo.`;
  }

  return { dias, livreCents, frase };
}
