"use client";

import { useState, useTransition } from "react";
import { FlowHeader } from "@/components/FlowHeader";
import { Button } from "@/components/ui/Button";
import { MoneyField } from "@/components/ui/MoneyField";
import { suggestWeekly } from "@/lib/engine";
import { formatEUR } from "@/lib/money";
import { createGoalAction, deleteGoalAction, updateGoalAction } from "./actions";

interface Props {
  goal?: {
    id: string;
    name: string;
    targetCents: number;
    deadline: string | null;
    weeklyCents: number;
    isEmergency: boolean;
  };
  /** Mês atual `yyyy-mm`, como piso do prazo. */
  minMonth: string;
}

export function GoalForm({ goal, minMonth }: Props) {
  const [name, setName] = useState(goal?.name ?? "");
  const [targetCents, setTargetCents] = useState(goal?.targetCents ?? 0);
  const [deadline, setDeadline] = useState<string | null>(goal?.deadline ?? null);
  // null = usar a sugestão (alvo/16 semanas).
  const [weekly, setWeekly] = useState<number | null>(goal && !goal.deadline ? goal.weeklyCents : null);
  const [isEmergency, setIsEmergency] = useState(goal?.isEmergency ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const suggested = suggestWeekly(targetCents);
  const effectiveWeekly = weekly ?? suggested;
  const valid = name.trim() !== "" && targetCents > 0;

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
        setError("Não foi possível salvar. Tente de novo.");
      }
    });

  const save = () => {
    const input = { name, targetCents, deadline, weeklyCents: deadline ? 0 : effectiveWeekly, isEmergency };
    return run(() => (goal ? updateGoalAction(goal.id, input) : createGoalAction(input)));
  };

  return (
    <div className="flex flex-1 flex-col">
      <FlowHeader title={goal ? "Editar meta" : "Nova meta"} closeHref={goal ? `/metas/${goal.id}` : "/metas"} />
      <main className="flex-1 space-y-4 px-5 pt-4">
        <label className="block text-xs text-muted">
          Nome
          <input
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base font-semibold text-ink"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div className="text-xs text-muted">
            Quanto juntar
            <MoneyField label="Quanto juntar" value={targetCents} onChange={setTargetCents} className="mt-1 bg-surface" />
          </div>
          <label className="text-xs text-muted">
            Prazo (opcional)
            <input
              type="month"
              min={minMonth}
              value={deadline ?? ""}
              onChange={(e) => setDeadline(e.target.value || null)}
              className="mt-1 min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base font-semibold text-ink"
            />
          </label>
        </div>

        {!deadline && (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              Sem prazo, sugerimos <strong className="text-ink">{formatEUR(suggested)} por semana</strong>. Você pode mudar.
            </p>
            <MoneyField
              key={weekly === null ? `auto-${suggested}` : "manual"}
              label="Valor por semana"
              suffix="por semana"
              value={effectiveWeekly}
              onChange={setWeekly}
              className="bg-surface"
            />
          </div>
        )}

        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={isEmergency}
            onChange={(e) => setIsEmergency(e.target.checked)}
            className="size-5 accent-brand"
          />
          Usar como reserva de emergência
        </label>

        {error && (
          <p role="alert" className="text-sm text-warn-ink">
            {error}
          </p>
        )}
      </main>
      <footer className="space-y-2 px-5 pt-4 pb-5">
        <Button disabled={!valid || pending} onClick={save}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        {goal &&
          (confirmDelete ? (
            <Button variant="outline" className="border-warn-ink text-warn-ink" disabled={pending} onClick={() => run(() => deleteGoalAction(goal.id))}>
              Confirmar exclusão
            </Button>
          ) : (
            <Button variant="ghost" className="text-warn-ink" onClick={() => setConfirmDelete(true)}>
              Excluir meta
            </Button>
          ))}
      </footer>
    </div>
  );
}
