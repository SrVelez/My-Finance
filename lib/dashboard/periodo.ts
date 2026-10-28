import { addDays, weekRange, type ISODate } from "@/lib/engine";
import { PERIODOS, type Periodo } from "./types";

export const SEMANAS_POR_PERIODO: Record<Periodo, number> = { semana: 1, mes: 4, "3meses": 13 };

export function parsePeriodo(value: unknown): Periodo {
  return PERIODOS.find((p) => p === value) ?? "semana";
}

export interface Intervalo {
  inicio: ISODate;
  fim: ISODate;
}

/** Termina no fim da semana de `today` e volta 1, 4 ou 13 semanas inteiras. */
export function intervaloDo(periodo: Periodo, today: ISODate, weekStartDay: number): Intervalo {
  const week = weekRange(today, weekStartDay);
  return { inicio: addDays(week.start, -7 * (SEMANAS_POR_PERIODO[periodo] - 1)), fim: week.end };
}

/** O período imediatamente anterior, com o mesmo tamanho. */
export function intervaloAnterior(atual: Intervalo, periodo: Periodo): Intervalo {
  const dias = 7 * SEMANAS_POR_PERIODO[periodo];
  return { inicio: addDays(atual.inicio, -dias), fim: addDays(atual.inicio, -1) };
}

export const noIntervalo = (date: ISODate, { inicio, fim }: Intervalo) => date >= inicio && date <= fim;
