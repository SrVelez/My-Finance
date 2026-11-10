"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/lib/result";

/** Aviso no rodapé com "Desfazer"; some sozinho depois de `seconds`. */
export function UndoToast({
  message,
  onUndo,
  onClose,
  seconds = 10,
}: {
  message: string;
  onUndo: () => Promise<ActionResult>;
  onClose: () => void;
  seconds?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  // O relógio não reinicia quando o pai renderiza de novo (ex.: a página revalida depois do ajuste).
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const t = setTimeout(() => close.current(), outcome ? 4000 : seconds * 1000);
    return () => clearTimeout(t);
  }, [outcome, seconds]);

  const undo = async () => {
    setBusy(true);
    const result = await onUndo();
    setBusy(false);
    setOutcome(result.ok ? "Desfeito." : result.error);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-20 z-50 mx-auto flex w-[calc(100%-2.5rem)] max-w-[390px] items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lg"
    >
      <span>{outcome ?? message}</span>
      {!outcome && (
        <button type="button" disabled={busy} onClick={undo} className="min-h-11 shrink-0 px-2 font-bold underline disabled:opacity-60">
          Desfazer
        </button>
      )}
    </div>
  );
}
