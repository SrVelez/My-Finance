"use client";

import { useState, useTransition } from "react";

/**
 * Roda uma Server Action dentro de uma transição e guarda a mensagem de erro.
 * `redirect()` é lançado internamente pelo Next (`NEXT_REDIRECT`), então é relançado;
 * só falhas reais viram `errorMessage`.
 */
export function useAction(errorMessage: string) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<void>, onOk?: () => void) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
        onOk?.();
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
        setError(errorMessage);
      }
    });

  return { run, pending, error };
}
