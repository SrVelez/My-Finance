import type { ButtonHTMLAttributes } from "react";

export function Chip({
  selected = false,
  dashed = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; dashed?: boolean }) {
  const tone = selected
    ? "border-brand bg-brand-soft text-brand-strong"
    : dashed
      ? "border-dashed border-neutral-bar bg-transparent text-muted"
      : "border-line bg-surface text-ink";
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...props}
      className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${tone} ${className}`}
    />
  );
}
