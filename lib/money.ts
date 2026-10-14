export type Cents = number;

const BRL_INT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** €500, €23,50, €1.500 — sem casas decimais quando o valor é inteiro. */
export function formatEUR(cents: Cents): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const euros = Math.trunc(abs / 100);
  const rest = abs % 100;
  const int = BRL_INT.format(euros);
  const body = rest === 0 ? int : `${int},${String(rest).padStart(2, "0")}`;
  return `${negative ? "-" : ""}€${body}`;
}

export const euros = (n: number): Cents => Math.round(n * 100);

/** Converte texto digitado ("23,5", "1.500") em centavos; NaN vira 0. */
export function parseEUR(input: string): Cents {
  const clean = input.replace(/[^\d,]/g, "");
  if (!clean) return 0;
  const [int, dec = ""] = clean.split(",");
  return Number(int || "0") * 100 + Number((dec + "00").slice(0, 2));
}

/** Arredonda para euros inteiros. */
export const roundToEuro = (cents: Cents): Cents => Math.round(cents / 100) * 100;
