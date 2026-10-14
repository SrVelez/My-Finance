import { parseEUR } from "@/lib/money";

export type Key = string; // "0"-"9", "," ou "back"

/** Aplica uma tecla ao texto digitado no teclado numérico. */
export function applyKey(text: string, key: Key): string {
  if (key === "back") return text.slice(0, -1);
  if (key === ",") return text.includes(",") ? text : `${text || "0"},`;
  if (!/^\d$/.test(key)) return text;
  const [int, dec] = text.split(",");
  if (dec !== undefined && dec.length >= 2) return text;
  if (dec === undefined && int.length >= 7) return text;
  if (text === "0") return key;
  return text + key;
}

/** Texto digitado → "€1.500,5" para exibição. */
export function displayAmount(text: string): string {
  const [int = "", dec] = text.split(",");
  const grouped = (int || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `€${grouped}${dec !== undefined ? `,${dec}` : ""}`;
}

export const amountCents = (text: string) => parseEUR(text);
