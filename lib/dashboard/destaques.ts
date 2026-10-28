import { SEMANAS_POR_PERIODO } from "./periodo";
import type { Recebimento } from "./recebimentos";
import type { Dashboard, Periodo } from "./types";

/** Recebido, % guardado em metas e quantas semanas tiveram falta. */
export function buildDestaques(rows: Recebimento[], periodo: Periodo): Dashboard["destaques"] {
  const recebidoCents = rows.reduce((s, r) => s + r.recebidoCents, 0);
  const metasCents = rows.reduce((s, r) => s + r.metasCents, 0);
  const apertadas = new Set(rows.filter((r) => r.faltaCents > 0).map((r) => r.semanaInicio));
  return {
    recebidoCents,
    guardadoPct: recebidoCents > 0 ? Math.round((metasCents / recebidoCents) * 100) : 0,
    semanasApertadas: apertadas.size,
    semanasTotais: SEMANAS_POR_PERIODO[periodo],
  };
}
