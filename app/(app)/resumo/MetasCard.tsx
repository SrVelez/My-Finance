import Link from "next/link";
import type { Dashboard } from "@/lib/dashboard/types";

export function MetasCard({ metas }: { metas: Dashboard["metas"] }) {
  return (
    <section aria-labelledby="t-metas" className="space-y-2">
      <h2 id="t-metas" className="font-bold">Metas no ritmo</h2>
      {metas.length === 0 ? (
        <div className="space-y-3 rounded-card border border-line bg-surface p-4 text-sm">
          <p className="text-muted">Crie uma meta para ver seu progresso aqui.</p>
          <Link href="/metas/nova" className="flex min-h-11 items-center justify-center rounded-xl bg-brand font-bold text-white">
            Nova meta
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {metas.map((m) => {
            const atrasada = m.status === "atrasada";
            return (
              <li key={m.id}>
                <Link href={`/metas/${m.id}`} className="block space-y-1.5 px-4 py-3">
                  <span className="flex justify-between text-sm">
                    <span className="font-semibold">{m.nome}</span>
                    <span className="text-muted">{m.pct}%</span>
                  </span>
                  <span
                    role="progressbar"
                    aria-label={`Progresso de ${m.nome}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={m.pct}
                    className="relative block h-2 w-full rounded-full bg-line"
                  >
                    <span
                      className={`block h-full rounded-full ${atrasada ? "bg-chart-late" : "bg-chart-free"}`}
                      style={{ width: `${m.pct}%` }}
                    />
                    {m.esperadoPct !== null && (
                      <span
                        aria-hidden
                        title="Onde você deveria estar"
                        className="absolute -top-1 h-4 w-0.5 rounded bg-ink"
                        style={{ left: `${m.esperadoPct}%` }}
                      />
                    )}
                  </span>
                  <span className={`block text-xs ${atrasada ? "font-semibold text-warn-ink" : "text-muted"}`}>{m.frase}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {metas.some((m) => m.esperadoPct !== null) && (
        <p className="text-xs text-muted">O traço escuro marca onde você deveria estar hoje.</p>
      )}
    </section>
  );
}
