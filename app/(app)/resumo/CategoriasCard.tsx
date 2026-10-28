import { ProgressBar } from "@/components/ui/ProgressBar";
import type { Dashboard } from "@/lib/dashboard/types";
import { formatEUR } from "@/lib/money";

export function CategoriasCard({ categorias, frase }: { categorias: NonNullable<Dashboard["categorias"]>; frase: string }) {
  const maior = categorias[0]?.totalCents ?? 0;
  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-4">
      <p className="text-sm font-semibold">{frase}</p>
      {categorias.length > 0 && (
        <ul className="space-y-3">
          {categorias.map((c) => (
            <li key={c.categoria} className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="font-semibold">{c.categoria}</span>
                <span className="text-muted">
                  {formatEUR(c.totalCents)} · {c.pct}%
                </span>
              </div>
              <ProgressBar label={`Gasto em ${c.categoria}`} value={c.totalCents} max={maior} size="md" fillClassName="bg-chart-free" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
