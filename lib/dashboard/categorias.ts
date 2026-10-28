import { CATEGORIES } from "@/lib/categories";
import { formatEUR, type Cents } from "@/lib/money";
import type { Dashboard, DashTx } from "./types";

type Categoria = NonNullable<Dashboard["categorias"]>[number];

/** Só as categorias do "Gastei"; qualquer outra (ex.: parte de conta paga do livre) vai para "Outro". */
function totais(expenses: DashTx[]): Map<string, Cents> {
  const map = new Map<string, Cents>();
  for (const t of expenses) {
    if (t.type !== "expense") continue;
    const key = (CATEGORIES as readonly string[]).includes(t.category ?? "") ? (t.category as string) : "Outro";
    map.set(key, (map.get(key) ?? 0) + t.amountCents);
  }
  return map;
}

/** Despesas por categoria, da maior para a menor. */
export function buildCategorias(expenses: DashTx[]): Categoria[] {
  const map = totais(expenses);
  const total = [...map.values()].reduce((s, c) => s + c, 0);
  return [...map]
    .map(([categoria, totalCents]) => ({ categoria, totalCents, pct: total > 0 ? Math.round((totalCents / total) * 100) : 0 }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

/** Maior categoria e, havendo período anterior com dados, a que mais subiu. */
export function categoriasFrase(atual: Categoria[], anteriores: DashTx[]): string {
  if (atual.length === 0) return "Nenhum gasto neste período.";
  let frase = `${atual[0].categoria} é ${atual[0].pct}% do que você gastou.`;

  const antes = totais(anteriores);
  if (antes.size > 0) {
    const subiu = atual
      .map((c) => ({ categoria: c.categoria, delta: c.totalCents - (antes.get(c.categoria) ?? 0) }))
      .sort((a, b) => b.delta - a.delta)[0];
    if (subiu.delta >= 100) frase += ` ${subiu.categoria} subiu ${formatEUR(subiu.delta)} em relação ao período anterior.`;
  }
  return frase;
}
