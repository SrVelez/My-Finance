export function ProgressBar({
  value,
  max,
  tone = "brand",
  label,
}: {
  value: number;
  max: number;
  tone?: "brand" | "onBrand";
  label: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const track = tone === "onBrand" ? "bg-white/25" : "bg-line";
  const fill = tone === "onBrand" ? "bg-white" : "bg-brand";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(Math.max(value, 0), max)}
      className={`h-1.5 w-full overflow-hidden rounded-full ${track}`}
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
