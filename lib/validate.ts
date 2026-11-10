/** Maior valor aceito em qualquer campo de dinheiro: €1.000.000, em centavos. */
export const MAX_CENTS = 100_000_000;

/** Palavra que a pessoa digita para confirmar "Recomeçar saldos". */
export const RESET_WORD = "ZERAR";

/** Prazo de meta no formato `yyyy-mm`. */
export const isDeadline = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/** Valida uma data ISO `yyyy-mm-dd` vinda do cliente. */
export function assertISODate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Data inválida");
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Error("Data inválida");
  return value;
}

export function assertCents(value: unknown, { min = 0 }: { min?: number } = {}): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > MAX_CENTS) {
    throw new Error("Valor inválido");
  }
  return value;
}

export function assertName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().slice(0, 40) : "";
  if (!name) throw new Error("Nome inválido");
  return name;
}

export function assertDueDay(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 31) {
    throw new Error("Dia inválido");
  }
  return value;
}

export function assertDeadline(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (!isDeadline(value)) throw new Error("Prazo inválido");
  return value;
}
