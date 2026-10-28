import type { Dashboard } from "@/lib/dashboard/types";
import { formatEUR } from "@/lib/money";

export function DestaquesCards({ d }: { d: Dashboard["destaques"] }) {
  return (
    <section aria-label="Destaques" className="grid grid-cols-3 gap-3">
      <Destaque rotulo="Recebido" valor={formatEUR(d.recebidoCents)} />
      <Destaque rotulo="Guardado" valor={`${d.guardadoPct}%`} detalhe="em metas" />
      <Destaque
        rotulo="Semanas apertadas"
        valor={`${d.semanasApertadas} de ${d.semanasTotais}`}
        alerta={d.semanasApertadas > 0}
      />
    </section>
  );
}

function Destaque({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className="flex flex-col justify-between rounded-card border border-line bg-surface p-3">
      <p className="text-[11px] leading-tight text-muted">{rotulo}</p>
      <p className={`mt-1 text-lg leading-tight font-extrabold ${alerta ? "text-warn-ink" : ""}`}>{valor}</p>
      {detalhe && <p className="text-[11px] text-muted">{detalhe}</p>}
    </div>
  );
}
