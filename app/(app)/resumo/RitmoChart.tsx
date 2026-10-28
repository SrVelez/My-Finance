"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { Dashboard } from "@/lib/dashboard/types";
import { weekdayShort } from "@/lib/engine";
import { formatEUR } from "@/lib/money";

type Dias = NonNullable<Dashboard["ritmoSemana"]>["dias"];

export default function RitmoChart({ dias }: { dias: Dias }) {
  // Só converte centavos em euros para o eixo; nenhuma regra financeira aqui.
  const data = dias.map((d) => ({
    dia: weekdayShort(d.data),
    gasto: d.gastoAcumuladoCents === null ? null : d.gastoAcumuladoCents / 100,
    ideal: d.idealCents / 100,
  }));

  return (
    <>
      <div className="h-44" role="img" aria-label="Gasto acumulado por dia contra o ritmo ideal da semana">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--color-line)" />
            <XAxis dataKey="dia" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `€${v}`} width={48} />
            <Line
              dataKey="ideal"
              stroke="var(--color-chart-bills)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="gasto"
              stroke="var(--color-chart-free)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "var(--color-chart-free)" }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Gasto acumulado e ritmo ideal por dia</caption>
        <thead>
          <tr><th>Dia</th><th>Gasto acumulado</th><th>Ritmo ideal</th></tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <tr key={d.data}>
              <td>{weekdayShort(d.data)}</td>
              <td>{d.gastoAcumuladoCents === null ? "—" : formatEUR(d.gastoAcumuladoCents)}</td>
              <td>{formatEUR(d.idealCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
