const HEIGHT = { sm: "h-1.5", md: "h-2", lg: "h-2.5" } as const;

export function ProgressBar({
  value,
  max,
  tone = "brand",
  label,
  size = "sm",
  fillClassName,
  marker,
}: {
  value: number;
  max: number;
  tone?: "brand" | "onBrand";
  label: string;
  size?: keyof typeof HEIGHT;
  /** Classe de cor da barra; substitui a cor do `tone`. */
  fillClassName?: string;
  /** Posição (0–100) de um traço que marca onde o progresso deveria estar. */
  marker?: number | null;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const track = tone === "onBrand" ? "bg-white/25" : "bg-line";
  const fill = fillClassName ?? (tone === "onBrand" ? "bg-white" : "bg-brand");
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(Math.max(value, 0), max)}
      className={`relative ${HEIGHT[size]} w-full rounded-full ${track} ${marker == null ? "overflow-hidden" : ""}`}
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      {marker != null && (
        <span
          aria-hidden
          title="Onde você deveria estar"
          className="absolute -top-1 h-4 w-0.5 rounded bg-ink"
          style={{ left: `${marker}%` }}
        />
      )}
    </div>
  );
}
