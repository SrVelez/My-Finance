/** Barra empilhada: contas (cinza), metas (laranja) e livre (verde). */
export function StackedBar({
  billsCents,
  goalsCents,
  freeCents,
}: {
  billsCents: number;
  goalsCents: number;
  freeCents: number;
}) {
  const total = billsCents + goalsCents + freeCents;
  const pct = (n: number) => (total > 0 ? `${(n / total) * 100}%` : "0%");
  return (
    <div
      role="img"
      aria-label="Divisão do dinheiro entre contas fixas, metas e livre"
      className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-line"
    >
      <div className="bg-neutral-bar" style={{ width: pct(billsCents) }} />
      <div className="bg-accent" style={{ width: pct(goalsCents) }} />
      <div className="bg-brand" style={{ width: pct(freeCents) }} />
    </div>
  );
}
