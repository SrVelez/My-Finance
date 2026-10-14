import type { ISODate } from "./types";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const pad = (n: number) => String(n).padStart(2, "0");

export function parseISO(iso: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

const utc = (iso: ISODate) => {
  const { y, m, d } = parseISO(iso);
  return Date.UTC(y, m - 1, d);
};

export const toISO = (y: number, m: number, d: number): ISODate => `${y}-${pad(m)}-${pad(d)}`;

export const daysBetween = (from: ISODate, to: ISODate): number =>
  Math.round((utc(to) - utc(from)) / 86_400_000);

export const addDays = (iso: ISODate, days: number): ISODate => {
  const t = new Date(utc(iso) + days * 86_400_000);
  return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Vencimento no mês dado; dias 29–31 caem no último dia de meses curtos. */
export function dueInMonth(y: number, m: number, dueDay: number): ISODate {
  return toISO(y, m, Math.min(dueDay, daysInMonth(y, m)));
}

function shiftMonth(y: number, m: number, delta: number) {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/** Vencimento mais recente em ou antes de `date`. */
export function lastDueOnOrBefore(dueDay: number, date: ISODate): ISODate {
  const { y, m } = parseISO(date);
  const here = dueInMonth(y, m, dueDay);
  if (here <= date) return here;
  const p = shiftMonth(y, m, -1);
  return dueInMonth(p.y, p.m, dueDay);
}

/** Primeiro vencimento estritamente depois de `date`. */
export function nextDueAfter(dueDay: number, date: ISODate): ISODate {
  const { y, m } = parseISO(date);
  const here = dueInMonth(y, m, dueDay);
  if (here > date) return here;
  const n = shiftMonth(y, m, 1);
  return dueInMonth(n.y, n.m, dueDay);
}

/** Primeiro vencimento em ou depois de `date`. */
export function nextDueOnOrAfter(dueDay: number, date: ISODate): ISODate {
  return nextDueAfter(dueDay, addDays(date, -1));
}

/** 1/nov */
export function formatDayMonth(iso: ISODate): string {
  const { m, d } = parseISO(iso);
  return `${d}/${MONTHS[m - 1]}`;
}

/** fev/2027 */
export function formatMonthYear(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]}/${y}`;
}

/** Semanas até o prazo (dia 15 do mês, ⌈dias/7⌉), no mínimo 1. */
export function weeksUntilDeadline(date: ISODate, deadline: string): number {
  const [y, m] = deadline.split("-").map(Number);
  const days = daysBetween(date, toISO(y, m, 15));
  return Math.max(1, Math.ceil(days / 7));
}

/** Recebimentos semanais entre `date` (inclusive) e o vencimento (inclusive). */
export function weeklyReceiptsUntil(date: ISODate, due: ISODate): number {
  return Math.max(1, Math.floor(daysBetween(date, due) / 7) + 1);
}

const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

/** Dia da semana (0 = domingo) de uma data ISO. */
export const weekdayIndex = (iso: ISODate): number => new Date(utc(iso)).getUTCDay();

/** DOM, SEG… */
export const weekdayShort = (iso: ISODate): string => WEEKDAYS[weekdayIndex(iso)];

/** Semana (7 dias) que contém `date`, começando em `startDay` (0 = domingo). */
export function weekRange(date: ISODate, startDay: number): { start: ISODate; end: ISODate } {
  const back = (weekdayIndex(date) - startDay + 7) % 7;
  const start = addDays(date, -back);
  return { start, end: addDays(start, 6) };
}

/** Semana de 6 a 12 out */
export function formatWeekLabel(start: ISODate, end: ISODate): string {
  const s = parseISO(start);
  const e = parseISO(end);
  return s.m === e.m
    ? `Semana de ${s.d} a ${e.d} ${MONTHS[e.m - 1]}`
    : `Semana de ${s.d} ${MONTHS[s.m - 1]} a ${e.d} ${MONTHS[e.m - 1]}`;
}

/** "Hoje, 8 out" ou "7 out" */
export function formatDateChip(date: ISODate, today: ISODate): string {
  const { d, m } = parseISO(date);
  return `${date === today ? "Hoje, " : ""}${d} ${MONTHS[m - 1]}`;
}
