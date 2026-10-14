"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { MoneyField } from "@/components/ui/MoneyField";
import { resetAllDataAction, saveSettingsAction } from "./actions";

const DAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export function SettingsForm({
  initial,
}: {
  initial: { name: string; weeklyLivingCents: number; weekStartDay: number };
}) {
  const [name, setName] = useState(initial.name);
  const [weekly, setWeekly] = useState(initial.weeklyLivingCents);
  const [weekStartDay, setWeekStartDay] = useState(initial.weekStartDay);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<void>, onOk?: () => void) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
        onOk?.();
      } catch (e) {
        // redirect() é lançado internamente pelo Next; só mostramos falhas reais.
        if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
        setError("Algo deu errado. Tente de novo.");
      }
    });

  return (
    <main className="flex-1 space-y-6 px-5 pt-5 pb-6">
      <h1 className="font-display text-3xl font-extrabold">Ajustes</h1>

      <section className="space-y-4 rounded-card border border-line bg-surface p-4">
        <label className="block text-xs text-muted">
          Seu nome
          <input
            value={name}
            maxLength={40}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-canvas px-3 text-base font-semibold text-ink"
          />
        </label>
        <div className="text-xs text-muted">
          Gasto semanal (dia a dia)
          <MoneyField
            label="Gasto semanal"
            suffix="por semana"
            value={weekly}
            onChange={(c) => {
              setWeekly(c);
              setSaved(false);
            }}
            className="mt-1"
          />
        </div>
        <label className="block text-xs text-muted">
          A semana começa em
          <select
            value={weekStartDay}
            onChange={(e) => {
              setWeekStartDay(Number(e.target.value));
              setSaved(false);
            }}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-canvas px-3 text-base font-semibold text-ink"
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={pending}
          onClick={() => run(() => saveSettingsAction({ name, weeklyLivingCents: weekly, weekStartDay }), () => setSaved(true))}
        >
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        {saved && (
          <p role="status" className="text-center text-sm font-semibold text-brand">
            ✓ Ajustes salvos
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-card border border-line bg-surface p-4">
        <h2 className="font-bold">Apagar todos os dados</h2>
        <p className="text-xs text-muted">
          Remove suas contas, metas e movimentações e volta ao começo. Não dá para desfazer.
        </p>
        {confirmReset ? (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Cancelar
            </Button>
            <Button
              variant="outline"
              className="border-warn-ink text-warn-ink"
              disabled={pending}
              onClick={() => run(() => resetAllDataAction())}
            >
              Sim, apagar tudo
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="text-warn-ink" onClick={() => setConfirmReset(true)}>
            Apagar todos os dados
          </Button>
        )}
      </section>

      {error && (
        <p role="alert" className="text-center text-sm text-warn-ink">
          {error}
        </p>
      )}
    </main>
  );
}
