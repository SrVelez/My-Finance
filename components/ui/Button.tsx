import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "outline";

const styles: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong disabled:bg-neutral-bar",
  outline: "border border-line bg-surface text-ink",
  ghost: "text-brand",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`min-h-12 w-full rounded-card px-4 text-base font-bold transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    />
  );
}
