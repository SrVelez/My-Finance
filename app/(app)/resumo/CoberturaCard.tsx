import type { Dashboard } from "@/lib/dashboard/types";
import { formatEUR } from "@/lib/money";

export function CoberturaCard({ c }: { c: Dashboard["proximoMes"] }) {
  return (
    <section aria-labelledby="t-cobertura" className="space-y-2">
      <h2 id="t-cobertura" className="font-bold">Cobertura do próximo mês</h2>
      <div className="space-y-2 rounded-card border border-line bg-surface p-4">
        <p className="text-sm font-semibold">{c.frase}</p>
        {c.totalCents > 0 && (
          <>
            <div
              role="progressbar"
              aria-label="Contas fixas cobertas"
              aria-valuemin={0}
              aria-valuemax={c.totalCents}
              aria-valuenow={c.guardadoCents}
              className="h-2.5 w-full overflow-hidden rounded-full bg-line"
            >
              <div className="h-full rounded-full bg-chart-bills" style={{ width: `${(c.guardadoCents / c.totalCents) * 100}%` }} />
            </div>
            <p className="flex justify-between text-xs text-muted">
              <span>{formatEUR(c.guardadoCents)} guardados</span>
              <span>de {formatEUR(c.totalCents)}</span>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
