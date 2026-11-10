import { useSyncExternalStore } from "react";
import type { OnboardingDraft } from "@/lib/draft";

/**
 * Rascunho do onboarding no aparelho (antes de existir conta). Fica no `localStorage`, sempre com
 * try/catch: se estiver bloqueado, vale só enquanto a aba estiver aberta. O `draftId` identifica o
 * rascunho: o servidor nunca grava o mesmo `draftId` duas vezes.
 */
export interface StoredDraft {
  draftId: string;
  draft: OnboardingDraft;
}

const KEY = "financa:onboarding-draft";
const EVENT = "financa:onboarding-draft-change";
let memory: string | null = null;

export function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function parseStored(raw: string | null): StoredDraft | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredDraft> | null;
    if (!v || typeof v.draftId !== "string" || !v.draft || !Array.isArray(v.draft.bills) || !Array.isArray(v.draft.goals)) return null;
    return v as StoredDraft;
  } catch {
    return null;
  }
}

export function writeStored(value: StoredDraft) {
  memory = JSON.stringify(value);
  try {
    localStorage.setItem(KEY, memory);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** Apaga o rascunho (depois de gravado na conta). */
export function clearStored() {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function newDraftId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** O rascunho guardado ("null" no servidor e antes de hidratar). */
export const useStoredDraftRaw = (): string | null => useSyncExternalStore(subscribe, readRaw, () => null);
