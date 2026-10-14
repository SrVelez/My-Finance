import { formatDateChip } from "@/lib/engine";
import { formatEUR } from "@/lib/money";
import type { HistoryDay } from "@/lib/statement";

/** Extrato de uma conta/meta, separado por data (mais recente primeiro). */
export function HistoryList({ days, today, empty }: { days: HistoryDay[]; today: string; empty: string }) {
  if (days.length === 0) {
    return <p className="rounded-card border border-line bg-surface p-4 text-sm text-muted">{empty}</p>;
  }
  return (
    <div className="space-y-4" data-testid="history">
      {days.map((day) => (
        <section key={day.date} aria-label={formatDateChip(day.date, today)}>
          <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
            {formatDateChip(day.date, today)}
          </h3>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {day.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-semibold">{item.label}</span>
                  <span className="block text-xs text-muted">{item.detail}</span>
                </span>
                <span
                  className={`shrink-0 font-extrabold ${
                    item.neutral ? "text-muted" : item.sign > 0 ? "text-brand" : "text-ink"
                  }`}
                >
                  {item.neutral ? "" : item.sign > 0 ? "+" : "−"}
                  {formatEUR(item.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
