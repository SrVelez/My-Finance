import { formatDateChip } from "@/lib/engine";
import { formatEUR } from "@/lib/money";
import type { StatementEntry, StatementLine } from "@/lib/statement";

const KIND_LABEL: Record<StatementLine["kind"], string> = {
  bill: "Conta fixa",
  goal: "Meta",
  reserve: "Reserva",
  free: "Livre",
};

/** Extrato: recebimentos (com a divisão do dinheiro), gastos e movimentações. */
export function StatementList({ entries, today }: { entries: StatementEntry[]; today: string }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-card border border-line bg-surface p-4 text-sm text-muted">
        Nenhuma movimentação ainda. Toque em Recebi ou Gastei para começar.
      </p>
    );
  }

  // O recebimento mais recente já vem aberto: é onde o dinheiro acabou de ser dividido.
  const firstIncome = entries.find((e) => e.kind === "income")?.id;

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface" data-testid="statement">
      {entries.map((e) => {
        const date = formatDateChip(e.date, today);
        if (e.kind === "expense") {
          return (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block font-semibold">{e.category}</span>
                <span className="block text-xs text-muted">Gasto do dia a dia · {date}</span>
              </span>
              <span className="font-extrabold">−{formatEUR(e.amountCents)}</span>
            </li>
          );
        }
        if (e.kind === "movement") {
          return (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block font-semibold">{e.label}</span>
                <span className="block text-xs text-muted">
                  {e.detail} · {date}
                </span>
              </span>
              <span className={`font-extrabold ${e.sign > 0 ? "text-brand" : ""}`}>
                {e.sign > 0 ? "+" : "−"}
                {formatEUR(e.amountCents)}
              </span>
            </li>
          );
        }
        return (
          <li key={e.id}>
            <details open={e.id === firstIncome} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block font-semibold">Recebi</span>
                  <span className="block text-xs text-muted">
                    {date}
                    {e.lines.length > 0 && (
                      <span className="group-open:hidden"> · toque para ver a divisão</span>
                    )}
                  </span>
                </span>
                <span className="font-extrabold text-brand">+{formatEUR(e.amountCents)}</span>
              </summary>
              {e.lines.length > 0 && (
                <ul className="space-y-1.5 border-t border-line bg-canvas/60 px-4 py-3" aria-label="Para onde foi o dinheiro">
                  {e.lines.map((l, i) => (
                    <li
                      key={`${l.kind}-${i}`}
                      className={`flex items-center justify-between gap-3 text-sm ${
                        l.kind === "free" ? "rounded-lg bg-brand-soft px-2 py-1.5 font-semibold text-brand-strong" : ""
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">→ {l.label}</span>
                        <span className="block text-[11px] font-normal text-muted">
                          {KIND_LABEL[l.kind]} · {l.detail}
                        </span>
                      </span>
                      <span className="shrink-0 font-bold">
                        {l.kind === "reserve" ? "+" : ""}
                        {formatEUR(l.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </li>
        );
      })}
    </ul>
  );
}
