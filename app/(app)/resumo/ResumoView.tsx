"use client";

import { useEffect, useState } from "react";
import { MIN_RECEBIMENTOS, type Dashboard, type Periodo } from "@/lib/dashboard/types";
import { CategoriasCard } from "./CategoriasCard";
import { CoberturaCard } from "./CoberturaCard";
import { DestaquesCards } from "./DestaquesCards";
import { MetasCard } from "./MetasCard";
import { gravarPeriodo, usePeriodo } from "./periodo";
import { RecebimentosCard } from "./RecebimentosCard";
import { RitmoCard } from "./RitmoCard";
import { Skeleton } from "./Skeleton";

const OPCOES: { valor: Periodo; rotulo: string }[] = [
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
  { valor: "3meses", rotulo: "3 meses" },
];

type Resposta = { chave: string; dados?: Dashboard; erro?: boolean };

export function ResumoView() {
  const periodo = usePeriodo();
  const [tentativa, setTentativa] = useState(0);
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const chave = `${periodo}:${tentativa}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dashboard?periodo=${periodo}`, { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Dashboard>) : Promise.reject(new Error(String(r.status)))))
      .then((dados) => setResposta({ chave, dados }))
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setResposta({ chave, erro: true });
      });
    return () => controller.abort();
  }, [periodo, chave]);

  // Sem `setState` síncrono no efeito: "carregando" = ainda não chegou a resposta desta chave.
  const atual = resposta?.chave === chave ? resposta : null;

  return (
    <main className="flex-1 space-y-6 px-5 pt-5 pb-6">
      <header className="space-y-3">
        <h1 className="font-display text-3xl font-extrabold">Resumo</h1>
        <div role="radiogroup" aria-label="Período" className="grid grid-cols-3 gap-1 rounded-xl bg-line p-1">
          {OPCOES.map((o) => (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={periodo === o.valor}
              onClick={() => gravarPeriodo(o.valor)}
              className={`min-h-11 rounded-lg text-sm font-semibold ${periodo === o.valor ? "bg-surface text-brand shadow-sm" : "text-muted"}`}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      </header>

      {!atual && <Skeleton />}

      {atual?.erro && (
        <div role="alert" className="space-y-3 rounded-card border border-line bg-surface p-4 text-sm">
          <p>Não deu para carregar o resumo.</p>
          <button
            type="button"
            onClick={() => setTentativa((n) => n + 1)}
            className="min-h-11 rounded-xl bg-brand px-4 font-bold text-white"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {atual?.dados && <Conteudo d={atual.dados} />}
    </main>
  );
}

function Conteudo({ d }: { d: Dashboard }) {
  const faltam = Math.max(0, MIN_RECEBIMENTOS - d.dadosSuficientes.recebimentosTotais);
  const semHistorico = (
    <p className="rounded-card border border-line bg-surface p-4 text-sm text-muted">
      Seu histórico aparece depois de {MIN_RECEBIMENTOS} recebimentos. Faltam {faltam}.
    </p>
  );

  return (
    <>
      <DestaquesCards d={d.destaques} />
      {d.ritmoSemana && <RitmoCard ritmo={d.ritmoSemana} />}
      {d.recebimentos && (
        <section aria-labelledby="t-recebimentos" className="space-y-2">
          <h2 id="t-recebimentos" className="font-bold">Para onde foi cada recebimento</h2>
          {d.dadosSuficientes.tendencias ? (
            <RecebimentosCard linhas={d.recebimentos} frase={d.recebimentosFrase ?? ""} />
          ) : (
            semHistorico
          )}
        </section>
      )}
      <MetasCard metas={d.metas} />
      {d.categorias && (
        <section aria-labelledby="t-categorias" className="space-y-2">
          <h2 id="t-categorias" className="font-bold">Gastos por categoria</h2>
          {d.dadosSuficientes.tendencias ? (
            <CategoriasCard categorias={d.categorias} frase={d.categoriasFrase ?? ""} />
          ) : (
            semHistorico
          )}
        </section>
      )}
      <CoberturaCard c={d.proximoMes} />
    </>
  );
}
