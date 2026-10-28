"use client";

import dynamic from "next/dynamic";
import type { Dashboard } from "@/lib/dashboard/types";
import { Legenda } from "./Legenda";

// Recharts só é baixado quando a tela precisa do gráfico.
const RitmoChart = dynamic(() => import("./RitmoChart"), {
  ssr: false,
  loading: () => <div className="h-44 animate-pulse rounded-xl bg-line" />,
});

export function RitmoCard({ ritmo }: { ritmo: NonNullable<Dashboard["ritmoSemana"]> }) {
  return (
    <section aria-labelledby="t-ritmo" className="space-y-2">
      <h2 id="t-ritmo" className="font-bold">Ritmo da semana</h2>
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="mb-3 text-sm font-semibold" data-testid="ritmo-frase">{ritmo.frase}</p>
        <RitmoChart dias={ritmo.dias} />
        <Legenda
          itens={[
            { cor: "bg-chart-free", rotulo: "Gasto acumulado" },
            { cor: "border-chart-bills", rotulo: "Ritmo ideal", tracejado: true },
          ]}
        />
      </div>
    </section>
  );
}
