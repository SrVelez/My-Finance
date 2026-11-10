"use client";

import { useRef } from "react";

/** Seis caixas para o código: aceita colar o código inteiro e o preenchimento automático do aparelho. */
export function OtpInput({
  value,
  onChange,
  disabled,
  length = 6,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  length?: number;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  /** Dígitos digitados ou colados entram a partir da caixa `from`. */
  const fill = (raw: string, from: number) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    const next = (value.slice(0, from) + digits).slice(0, length);
    onChange(next);
    focus(Math.min(next.length, length - 1));
  };

  return (
    <div role="group" aria-label={`Código de ${length} dígitos`} className="flex justify-between gap-2">
      {Array.from({ length }, (_, i) => {
        const digit = value[i] ?? "";
        return (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            aria-label={`Dígito ${i + 1}`}
            inputMode="numeric"
            // O primeiro campo recebe o código inteiro do preenchimento automático (SMS/e-mail).
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={i === 0 ? length : 1}
            disabled={disabled}
            value={digit}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => fill(e.target.value, i)}
            onPaste={(e) => {
              e.preventDefault();
              fill(e.clipboardData.getData("text"), 0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace") {
                e.preventDefault();
                onChange(value.slice(0, digit ? i : Math.max(0, i - 1)));
                focus(digit ? i : i - 1);
              } else if (e.key === "ArrowLeft") focus(i - 1);
              else if (e.key === "ArrowRight") focus(i + 1);
            }}
            className="min-h-14 w-full min-w-0 rounded-xl border border-line bg-surface text-center text-2xl font-extrabold text-ink focus:border-brand focus:outline-none disabled:opacity-60"
          />
        );
      })}
    </div>
  );
}
