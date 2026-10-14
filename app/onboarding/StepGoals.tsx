"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { MoneyField } from "@/components/ui/MoneyField";
import { effectiveWeekly, GOAL_PRESETS, newId, type DraftGoal } from "@/lib/draft";
import { formatMonthYear } from "@/lib/engine";
import { formatEUR } from "@/lib/money";
import { todayISO } from "@/lib/today";
import { Shell } from "./Shell";
import type { StepProps } from "./OnboardingFlow";

export function StepGoals({ draft, update, go }: StepProps) {
  const [editing, setEditing] = useState<string | null>(null);

  const patch = (id: string, p: Partial<DraftGoal>) =>
    update((d) => ({ ...d, goals: d.goals.map((g) => (g.id === id ? { ...g, ...p } : g)) }));
  const remove = (id: string) => update((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== id) }));

  const add = (g: Omit<DraftGoal, "id">) => {
    const id = newId();
    update((d) => ({ ...d, goals: [...d.goals, { id, ...g }] }));
    setEditing(id);
  };

  const togglePreset = (p: (typeof GOAL_PRESETS)[number]) => {
    const existing = draft.goals.find((g) => g.preset === p.name);
    if (existing) return remove(existing.id);
    add({ preset: p.name, name: p.name, targetCents: p.targetCents, deadline: null, weeklyCents: null, isEmergency: !!p.isEmergency });
  };

  const addCustom = () =>
    add({ name: "", targetCents: 0, deadline: null, weeklyCents: null, isEmergency: false });

  const valid = draft.goals.every((g) => g.name.trim() && g.targetCents > 0);
  const next = () => go(draft.goals.length ? 3 : 4);

  return (
    <Shell
      step={2}
      onBack={() => go(1)}
      title="Para o que você quer juntar dinheiro?"
      subtitle="Metas com prazo recebem um valor certo por semana até a data."
      footer={
        <>
          <Button disabled={!valid} onClick={next}>
            Continuar
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              update((d) => ({ ...d, goals: [] }));
              go(4);
            }}
          >
            Pular por agora
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        {GOAL_PRESETS.map((p) => (
          <Chip key={p.name} selected={draft.goals.some((g) => g.preset === p.name)} onClick={() => togglePreset(p)}>
            {p.name}
          </Chip>
        ))}
        <Chip dashed onClick={addCustom}>
          + Outra
        </Chip>
      </div>

      <ul className="space-y-3">
        {draft.goals.map((g) =>
          editing === g.id ? (
            <li key={g.id} className="space-y-3 rounded-card border-2 border-brand bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                {g.preset ? (
                  <span className="font-bold">{g.name}</span>
                ) : (
                  <input
                    aria-label="Nome da meta"
                    placeholder="Nome da meta"
                    value={g.name}
                    maxLength={40}
                    onChange={(e) => patch(g.id, { name: e.target.value })}
                    className="min-h-11 min-w-0 flex-1 font-bold outline-none"
                  />
                )}
                <span className="shrink-0 rounded-md bg-brand-soft px-2 py-1 text-xs font-semibold text-brand-strong">
                  Editando
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-xs text-muted">
                  Quanto juntar
                  <MoneyField
                    label={`Quanto juntar para ${g.name || "a meta"}`}
                    value={g.targetCents}
                    onChange={(targetCents) => patch(g.id, { targetCents })}
                    className="mt-1"
                  />
                </div>
                <label className="text-xs text-muted">
                  Prazo (opcional)
                  <input
                    type="month"
                    min={todayISO().slice(0, 7)}
                    value={g.deadline ?? ""}
                    onChange={(e) => patch(g.id, { deadline: e.target.value || null })}
                    className="mt-1 min-h-12 w-full rounded-xl border border-line bg-canvas px-3 text-base font-semibold text-ink"
                  />
                </label>
              </div>
              {!g.deadline && (
                <div className="space-y-2">
                  <p className="text-xs text-muted">
                    Sem prazo, sugerimos <strong className="text-ink">{formatEUR(effectiveWeekly(g))} por semana</strong>.
                    Você pode mudar.
                  </p>
                  <MoneyField
                    key={g.weeklyCents === null ? `auto-${effectiveWeekly(g)}` : "manual"}
                    label="Valor por semana"
                    suffix="por semana"
                    value={effectiveWeekly(g)}
                    onChange={(weeklyCents) => patch(g.id, { weeklyCents })}
                  />
                </div>
              )}
              <div className="flex items-center justify-between">
                <Button variant="ghost" className="w-auto text-warn-ink" onClick={() => remove(g.id)}>
                  Remover
                </Button>
                <Button variant="ghost" className="w-auto" onClick={() => setEditing(null)}>
                  Pronto
                </Button>
              </div>
            </li>
          ) : (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => setEditing(g.id)}
                className="flex w-full items-center justify-between rounded-card border border-line bg-surface px-4 py-3 text-left"
              >
                <span>
                  <span className="block font-semibold">{g.name || "Nova meta"}</span>
                  <span className="block text-xs text-muted">
                    {g.deadline ? `Até ${formatMonthYear(g.deadline)}` : "Sem prazo"}
                  </span>
                </span>
                <span className="text-lg font-extrabold">{formatEUR(g.targetCents)}</span>
              </button>
            </li>
          ),
        )}
      </ul>
    </Shell>
  );
}
