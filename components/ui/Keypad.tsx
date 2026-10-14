"use client";

import { useEffect, useState } from "react";
import { applyKey, type Key } from "@/lib/amount";

/** Estado do valor digitado: aceita o teclado da tela e o físico. */
export function useAmountInput() {
  const [text, setText] = useState("");
  const press = (key: Key) => setText((t) => applyKey(t, key));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^\d$/.test(e.key)) setText((t) => applyKey(t, e.key));
      else if (e.key === "," || e.key === ".") setText((t) => applyKey(t, ","));
      else if (e.key === "Backspace") setText((t) => applyKey(t, "back"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { text, press };
}

const KEYS: Key[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "back"];

export function Keypad({ onPress }: { onPress: (key: Key) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Teclado numérico">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onPress(k)}
          aria-label={k === "back" ? "Apagar" : k === "," ? "Vírgula" : k}
          className="flex min-h-14 items-center justify-center rounded-xl bg-surface text-2xl font-semibold active:bg-brand-soft"
        >
          {k === "back" ? "⌫" : k}
        </button>
      ))}
    </div>
  );
}
