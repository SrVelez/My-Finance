import Link from "next/link";
import { Suspense } from "react";
import { formatEUR } from "@/lib/money";
import { listGoals } from "@/lib/services/goals";
import { serverToday } from "@/lib/services/today";
import { GoalsList } from "./GoalsList";

export default function MetasPage() {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy />}>
      <Metas />
    </Suspense>
  );
}

async function Metas() {
  const { savedCents, weeklyCents, goals } = await listGoals(await serverToday());
  return (
    <main className="flex-1 space-y-4 px-5 pt-5 pb-6">
      <header>
        <h1 className="font-display text-3xl font-extrabold">Metas</h1>
        <p className="mt-1 text-xs text-muted">
          {formatEUR(savedCents)} guardados · {formatEUR(weeklyCents)} por semana
        </p>
      </header>

      {goals.length === 0 && (
        <p className="rounded-card border border-line bg-surface p-4 text-sm text-muted">
          Nenhuma meta ainda. Metas com prazo recebem um valor certo por semana.
        </p>
      )}

      {/* `key` reinicia o modo de reordenar quando a lista muda no servidor. */}
      <GoalsList key={goals.map((g) => `${g.id}:${g.priority}`).join()} goals={goals} />

      <Link
        href="/metas/nova"
        className="flex min-h-12 items-center justify-center rounded-card border border-dashed border-neutral-bar text-sm font-semibold text-muted"
      >
        + Nova meta
      </Link>
    </main>
  );
}
