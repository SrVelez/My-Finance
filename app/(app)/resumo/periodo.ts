import { useSyncExternalStore } from "react";
import { parsePeriodo } from "@/lib/dashboard/periodo";
import type { Periodo } from "@/lib/dashboard/types";

const KEY = "resumo:periodo";
const EVENT = "resumo:periodo-change";

/** Se o localStorage estiver bloqueado, a escolha vale só enquanto a aba estiver aberta. */
let memoria: Periodo = "semana";

function ler(): Periodo {
  try {
    return parsePeriodo(localStorage.getItem(KEY) ?? memoria);
  } catch {
    return memoria;
  }
}

export function gravarPeriodo(periodo: Periodo) {
  memoria = periodo;
  try {
    localStorage.setItem(KEY, periodo);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Período escolhido: "semana" no servidor, o lembrado no navegador depois de hidratar. */
export const usePeriodo = (): Periodo => useSyncExternalStore(subscribe, ler, () => "semana");
