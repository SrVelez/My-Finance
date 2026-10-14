"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { MoneyField } from "@/components/ui/MoneyField";
import { BILL_PRESETS, newId, type DraftBill } from "@/lib/draft";
import { formatEUR } from "@/lib/money";
import { Shell } from "./Shell";
import type { StepProps } from "./OnboardingFlow";

export function StepBills({ draft, update, go }: StepProps) {
  const [editing, setEditing] = useState<string | null>(null);

  const patch = (id: string, p: Partial<DraftBill>) =>
    update((d) => ({ ...d, bills: d.bills.map((b) => (b.id === id ? { ...b, ...p } : b)) }));
  const remove = (id: string) => update((d) => ({ ...d, bills: d.bills.filter((b) => b.id !== id) }));

  const togglePreset = (p: (typeof BILL_PRESETS)[number]) => {
    const existing = draft.bills.find((b) => b.preset === p.name);
    if (existing) return remove(existing.id);
    update((d) => ({ ...d, bills: [...d.bills, { id: newId(), preset: p.name, ...p }] }));
  };

  const addCustom = () => {
    const id = newId();
    update((d) => ({ ...d, bills: [...d.bills, { id, name: "", amountCents: 0, dueDay: 1 }] }));
    setEditing(id);
  };

  const valid =
    draft.weeklyLivingCents > 0 &&
    draft.bills.every((b) => b.name.trim() && b.amountCents > 0 && b.dueDay >= 1 && b.dueDay <= 31);

  return (
    <Shell
      step={1}
      title="Quais são suas contas fixas?"
      subtitle="Tudo o que você paga todo mês. Dá para ajustar depois."
      footer={
        <Button disabled={!valid} onClick={() => go(2)}>
          Continuar
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2">
        {BILL_PRESETS.map((p) => (
          <Chip key={p.name} selected={draft.bills.some((b) => b.preset === p.name)} onClick={() => togglePreset(p)}>
            {p.name}
          </Chip>
        ))}
        <Chip dashed onClick={addCustom}>
          + Outra
        </Chip>
      </div>

      {draft.bills.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {draft.bills.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setEditing(editing === b.id ? null : b.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span>
                  <span className="block font-semibold">{b.name || "Nova conta"}</span>
                  <span className="block text-xs text-muted">Vence todo dia {b.dueDay}</span>
                </span>
                <span className="text-lg font-extrabold">{formatEUR(b.amountCents)}</span>
              </button>
              {editing === b.id && (
                <div className="space-y-3 bg-canvas/60 px-4 pb-4">
                  <label className="block text-xs text-muted">
                    Nome
                    <input
                      value={b.name}
                      maxLength={40}
                      onChange={(e) => patch(b.id, { name: e.target.value })}
                      className="mt-1 min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base font-semibold text-ink"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-xs text-muted">
                      Valor
                      <MoneyField
                        label={`Valor de ${b.name || "conta"}`}
                        value={b.amountCents}
                        onChange={(amountCents) => patch(b.id, { amountCents })}
                        className="mt-1 bg-surface"
                      />
                    </div>
                    <label className="text-xs text-muted">
                      Vence todo dia
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={31}
                        value={b.dueDay}
                        onChange={(e) => patch(b.id, { dueDay: Number(e.target.value) })}
                        className="mt-1 min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-lg font-bold text-ink"
                      />
                    </label>
                  </div>
                  <Button variant="ghost" className="min-h-11 text-warn-ink" onClick={() => remove(b.id)}>
                    Remover conta
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="font-bold">Quanto você precisa por semana para viver?</h2>
        <p className="mt-1 text-xs text-muted">Mercado, transporte, o dia a dia.</p>
        <MoneyField
          label="Gasto semanal"
          suffix="por semana"
          value={draft.weeklyLivingCents}
          onChange={(weeklyLivingCents) => update((d) => ({ ...d, weeklyLivingCents }))}
          className="mt-3"
        />
      </section>
    </Shell>
  );
}
