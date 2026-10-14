"use client";

import { useState } from "react";
import { parseEUR, type Cents } from "@/lib/money";

const toText = (cents: Cents) => (cents ? String(cents / 100).replace(".", ",") : "");

function sanitize(raw: string): string {
  const only = raw.replace(/[^\d,]/g, "");
  const [int, ...rest] = only.split(",");
  return rest.length ? `${int},${rest.join("").slice(0, 2)}` : int;
}

/** Campo de valor em euros; guarda centavos inteiros no estado do pai. */
export function MoneyField({
  value,
  onChange,
  label,
  suffix,
  className = "",
}: {
  value: Cents;
  onChange: (cents: Cents) => void;
  label: string;
  suffix?: string;
  className?: string;
}) {
  const [text, setText] = useState(toText(value));
  return (
    <label
      className={`flex min-h-12 items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 text-lg font-bold text-ink ${className}`}
    >
      <span className="text-muted" aria-hidden>
        €
      </span>
      <input
        aria-label={label}
        inputMode="decimal"
        placeholder="0"
        value={text}
        onChange={(e) => {
          const next = sanitize(e.target.value);
          setText(next);
          onChange(parseEUR(next));
        }}
        className="w-full min-w-0 bg-transparent outline-none"
      />
      {suffix && <span className="shrink-0 text-xs font-medium text-muted">{suffix}</span>}
    </label>
  );
}
