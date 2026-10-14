"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { MoneyField } from "@/components/ui/MoneyField";
import { StackedBar } from "@/components/ui/StackedBar";
import { toEngineState } from "@/lib/draft";
import { distribute, type Allocation } from "@/lib/engine";
import { euros, formatEUR } from "@/lib/money";
import { todayISO } from "@/lib/today";
import { finishOnboarding } from "./actions";
import { Shell } from "./Shell";
import type { StepProps } from "./OnboardingFlow";

export function StepPreview({ draft, go }: StepProps) {
  const [income, setIncome] = useState(euros(500));
  const [editingIncome, setEditingIncome] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Simulação pura: nada é gravado até "Começar a usar".
  const dist = useMemo(
    () => distribute({ incomeCents: income, date: todayISO(), state: toEngineState(draft, todayISO()), assumeFreshCycle: true }),
    [income, draft],
  );

  const bills = dist.allocations.filter((a) => a.kind === "bill");
  const goals = dist.allocations.filter((a) => a.kind === "goal");

  const start = () =>
    startTransition(async () => {
      try {
        await finishOnboarding(draft);
      } catch (e) {
        // redirect() lança internamente; só mostramos erros reais.
        if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
        setError("Não foi possível salvar. Tente de novo.");
      }
    });

  return (
    <Shell
      step={4}
      onBack={() => go(draft.goals.length ? 3 : 2)}
      title="Veja como ficaria"
      subtitle="Uma simulação. Nada foi registrado ainda."
      footer={
        <>
          {error && (
            <p role="alert" className="text-center text-sm text-warn-ink">
              {error}
            </p>
          )}
          <Button disabled={pending} onClick={start}>
            {pending ? "Salvando…" : "Começar a usar"}
          </Button>
          <Button variant="ghost" onClick={() => go(draft.goals.length ? 3 : 2)}>
            Ajustar prioridades
          </Button>
        </>
      }
    >
      <div className="flex min-h-14 items-center justify-between rounded-card border border-line bg-surface px-4">
        <span className="text-sm text-muted">Se eu receber</span>
        {editingIncome ? (
          <MoneyField label="Valor recebido" value={income} onChange={setIncome} className="w-36" />
        ) : (
          <button type="button" aria-label="Editar valor recebido" onClick={() => setEditingIncome(true)} className="flex items-center gap-2">
            <span className="text-xl font-extrabold">{formatEUR(income)}</span>
            <span aria-hidden className="text-muted">
              ✎
            </span>
          </button>
        )}
      </div>

      <section className="rounded-card bg-brand p-5 text-white">
        <p className="text-sm">Livre para gastar esta semana</p>
        <p className="mt-1 font-display text-6xl leading-none font-extrabold">{formatEUR(dist.freeCents)}</p>
        <p className="mt-3 text-xs">
          {formatEUR(dist.livingCents)} para o dia a dia + {formatEUR(dist.slackCents)} de folga
        </p>
      </section>

      <StackedBar billsCents={dist.billsCents} goalsCents={dist.goalsCents} freeCents={dist.freeCents} />

      <section className="space-y-4 rounded-card border border-line bg-surface p-4">
        <Group dot="bg-neutral-bar" title="Contas fixas" total={dist.billsCents} items={bills} />
        {goals.length > 0 && (
          <div className="border-t border-line pt-4">
            <Group dot="bg-accent" title="Metas" total={dist.goalsCents} items={goals} numbered />
          </div>
        )}
      </section>
    </Shell>
  );
}

function Group({
  dot,
  title,
  total,
  items,
  numbered = false,
}: {
  dot: string;
  title: string;
  total: number;
  items: Allocation[];
  numbered?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-bold">
          <span className={`size-2.5 rounded-sm ${dot}`} aria-hidden />
          {title}
        </span>
        <span className="font-extrabold">{formatEUR(total)}</span>
      </div>
      <ul className="mt-2 space-y-1 pl-4 text-sm text-muted">
        {items.map((a, i) => (
          <li key={a.id} className="flex justify-between">
            <span>
              {numbered ? `${i + 1}. ` : ""}
              {a.name}
            </span>
            <span>{formatEUR(a.amountCents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
