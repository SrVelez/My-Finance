"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Dashboard } from "@/lib/dashboard/types";
import { formatDateChip, formatDayMonth } from "@/lib/engine";
import { formatEUR } from "@/lib/money";
import { Legenda } from "./Legenda";

const RecebimentosChart = dynamic(() => import("./RecebimentosChart"), {
  ssr: false,
  loading: () => <div className="h-52 animate-pulse rounded-xl bg-line" />,
});

type Linhas = NonNullable<Dashboard["recebimentos"]>;

export function RecebimentosCard({ linhas, frase }: { linhas: Linhas; frase: string }) {
  const [aberto, setAberto] = useState<number | null>(null);
  const escolhida = aberto === null ? null : linhas[aberto];

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="mb-3 text-sm font-semibold">{frase}</p>
      <RecebimentosChart linhas={linhas} selecionada={aberto} onSelecionar={setAberto} />
      <Legenda
        itens={[
          { cor: "bg-chart-bills", rotulo: "Contas" },
          { cor: "bg-chart-living", rotulo: "Dia a dia" },
          { cor: "bg-chart-goals", rotulo: "Metas" },
          { cor: "bg-chart-free", rotulo: "Folga" },
        ]}
      />
      <p className="mt-1 text-xs text-muted">▲ marca a semana em que não deu para tudo. Toque numa barra para ver os detalhes.</p>

      {escolhida && (
        <div className="mt-3 space-y-2 border-t border-line pt-3" data-testid="recebimento-detalhe">
          <h3 className="text-sm font-bold">Semana de {formatDayMonth(escolhida.semanaInicio)}</h3>
          {escolhida.faltaCents > 0 && (
            <p className="text-xs font-semibold text-warn-ink">Faltaram {formatEUR(escolhida.faltaCents)} para o dia a dia.</p>
          )}
          <ul className="divide-y divide-line text-sm">
            {escolhida.detalhe.map((i, n) => (
              <li key={n} className="flex justify-between py-1.5">
                <span>
                  {i.rotulo} <span className="text-xs text-muted">· {formatDateChip(i.data, "")}</span>
                </span>
                <span className={i.sinal === 1 ? "font-bold text-brand" : ""}>
                  {i.sinal === 1 ? "+" : "−"}
                  {formatEUR(i.cents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
