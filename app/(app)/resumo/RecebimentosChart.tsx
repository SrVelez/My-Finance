"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { Dashboard } from "@/lib/dashboard/types";
import { formatDayMonth } from "@/lib/engine";
import { formatEUR } from "@/lib/money";

type Linhas = NonNullable<Dashboard["recebimentos"]>;

interface Props {
  linhas: Linhas;
  selecionada: number | null;
  onSelecionar: (i: number | null) => void;
}

export default function RecebimentosChart({ linhas, selecionada, onSelecionar }: Props) {
  const data = linhas.map((l) => ({
    rotulo: `${formatDayMonth(l.semanaInicio)}${l.faltaCents > 0 ? " ▲" : ""}`,
    contas: l.contasCents / 100,
    diaADia: l.diaADiaCents / 100,
    metas: l.metasCents / 100,
    folga: l.folgaCents / 100,
  }));
  const toggle = (i: number) => onSelecionar(selecionada === i ? null : i);

  return (
    <>
      <div className="h-52" role="img" aria-label="Para onde foi cada recebimento: contas, dia a dia, metas e folga">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <XAxis dataKey="rotulo" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `€${v}`} width={48} />
            {[
              ["contas", "var(--color-chart-bills)"],
              ["diaADia", "var(--color-chart-living)"],
              ["metas", "var(--color-chart-goals)"],
              ["folga", "var(--color-chart-free)"],
            ].map(([chave, cor]) => (
              <Bar key={chave} dataKey={chave} stackId="r" fill={cor} stroke="var(--color-surface)" strokeWidth={1} isAnimationActive={false} onClick={(_, i) => toggle(i)}>
                {data.map((_, i) => (
                  <Cell key={i} fillOpacity={selecionada === null || selecionada === i ? 1 : 0.4} cursor="pointer" />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Alternativa em texto e por teclado: cada recebimento é um botão. */}
      <ul className="sr-only">
        {linhas.map((l, i) => (
          <li key={i}>
            <button type="button" onClick={() => toggle(i)}>
              Semana de {formatDayMonth(l.semanaInicio)}: recebido {formatEUR(l.recebidoCents)}, contas {formatEUR(l.contasCents)}, dia a dia{" "}
              {formatEUR(l.diaADiaCents)}, metas {formatEUR(l.metasCents)}, folga {formatEUR(l.folgaCents)}
              {l.faltaCents > 0 ? `, faltaram ${formatEUR(l.faltaCents)}` : ""}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
