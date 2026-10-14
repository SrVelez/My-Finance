"use client";

import { useState, useTransition } from "react";
import { FlowHeader } from "@/components/FlowHeader";
import { Button } from "@/components/ui/Button";
import { Keypad, useAmountInput } from "@/components/ui/Keypad";
import { MoneyField } from "@/components/ui/MoneyField";
import { amountCents, displayAmount } from "@/lib/amount";
import { formatDateChip } from "@/lib/engine";
import { formatEUR } from "@/lib/money";
import type { IncomeSimulation } from "@/lib/services/income";
import { todayISO } from "@/lib/today";
import { confirmIncomeAction, simulateIncomeAction } from "./actions";

type Step = "valor" | "distribuicao" | "falta";

export function ReceberFlow() {
  const [step, setStep] = useState<Step>("valor");
  const [sim, setSim] = useState<IncomeSimulation | null>(null);
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { text, press } = useAmountInput();
  const cents = amountCents(text);

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        // redirect() é lançado internamente pelo Next; só mostramos falhas reais.
        if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
        setError("Algo deu errado. Tente de novo.");
      }
    });

  const showDistribution = () =>
    run(async () => {
      const result = await simulateIncomeAction(cents, date);
      setSim(result);
      setStep(result.distribution.shortfallCents > 0 ? "falta" : "distribuicao");
    });

  if (step === "valor") {
    const today = todayISO();
    return (
      <div className="flex flex-1 flex-col">
        <FlowHeader title="Recebi" />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-5">
          <p className="text-sm text-muted">Quanto você recebeu?</p>
          <p className="font-display text-6xl font-extrabold" aria-live="polite" data-testid="amount">
            {displayAmount(text)}
          </p>
          <label className="relative flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-semibold">
            <span aria-hidden>📅</span>
            {formatDateChip(date, today)}
            <input
              type="date"
              aria-label="Data do recebimento"
              value={date}
              max={today}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </main>
        <div className="space-y-3 px-5 pb-5">
          {error && (
            <p role="alert" className="text-center text-sm text-warn-ink">
              {error}
            </p>
          )}
          <Keypad onPress={press} />
          <Button disabled={cents <= 0 || pending} onClick={showDistribution}>
            {pending ? "Calculando…" : "Ver distribuição"}
          </Button>
        </div>
      </div>
    );
  }

  if (!sim) return null;

  if (step === "falta") return <Shortfall sim={sim} back={() => setStep("valor")} />;
  return <Distribution sim={sim} back={() => setStep("valor")} />;
}

function Distribution({ sim, back }: { sim: IncomeSimulation; back: () => void }) {
  const { distribution: d, incomeCents, date } = sim;
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(d.allocations.map((a) => [a.id, a.amountCents])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toSave = d.allocations.reduce((s, a) => s + (values[a.id] ?? 0), 0);
  const free = incomeCents - toSave;
  const living = Math.min(sim.weeklyLivingCents, Math.max(free, 0));
  const over = free < 0;

  const confirm = () =>
    startTransition(async () => {
      setError(null);
      try {
        await confirmIncomeAction({ incomeCents, date, overrides: editing ? values : undefined });
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
        setError("Não foi possível confirmar. Tente de novo.");
      }
    });

  return (
    <div className="flex flex-1 flex-col">
      <FlowHeader title={`Você recebeu ${formatEUR(incomeCents)}`} onBack={back} />
      <main className="flex-1 space-y-5 px-5 pt-4 pb-4">
        <section className="rounded-card bg-brand p-5 text-white">
          <p className="text-sm">Livre para gastar esta semana</p>
          <p className="mt-1 font-display text-6xl leading-none font-extrabold" data-testid="free">
            {formatEUR(free)}
          </p>
          <p className="mt-3 text-xs">
            {formatEUR(living)} para o dia a dia + {formatEUR(Math.max(free - living, 0))} de folga
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-muted">
            PARA GUARDAR · {formatEUR(toSave)}
          </h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {d.allocations.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-semibold">{a.name}</span>
                  <span className="block text-xs text-muted">{a.reason}</span>
                </span>
                {editing ? (
                  <MoneyField
                    label={`Valor para ${a.name}`}
                    value={values[a.id] ?? 0}
                    onChange={(c) => setValues((v) => ({ ...v, [a.id]: c }))}
                    className="w-28 shrink-0"
                  />
                ) : (
                  <span className="font-extrabold">{formatEUR(a.amountCents)}</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {over && (
          <p role="alert" className="rounded-card bg-warn-bg p-3 text-sm text-warn-ink">
            Os valores passam do que você recebeu em {formatEUR(-free)}.
          </p>
        )}
        {error && (
          <p role="alert" className="text-center text-sm text-warn-ink">
            {error}
          </p>
        )}
      </main>
      <footer className="sticky bottom-0 grid grid-cols-2 gap-3 bg-canvas px-5 pt-3 pb-5">
        <Button variant="outline" onClick={() => setEditing((e) => !e)}>
          {editing ? "Usar sugestão" : "Ajustar"}
        </Button>
        <Button disabled={over || pending} onClick={confirm}>
          {pending ? "Salvando…" : "Confirmar"}
        </Button>
      </footer>
    </div>
  );
}

function Shortfall({ sim, back }: { sim: IncomeSimulation; back: () => void }) {
  const { distribution: d, reserve } = sim;
  const canUseReserve = !!reserve && reserve.withdrawalCents > 0;
  const [option, setOption] = useState<"reserve" | "less">(canUseReserve ? "reserve" : "less");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const billsCovered = d.allocations.filter((a) => a.kind === "bill").every((a) => !a.reason.startsWith("Dinheiro insuficiente"));
  const goalsPaused = d.goalsCents === 0;

  const confirm = () =>
    startTransition(async () => {
      setError(null);
      try {
        await confirmIncomeAction({
          incomeCents: sim.incomeCents,
          date: sim.date,
          useReserve: option === "reserve",
        });
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
        setError("Não foi possível confirmar. Tente de novo.");
      }
    });

  return (
    <div className="flex flex-1 flex-col">
      <FlowHeader title={`Você recebeu ${formatEUR(sim.incomeCents)}`} onBack={back} />
      <main className="flex-1 space-y-5 px-5 pt-4 pb-4">
        <section role="alert" className="rounded-card border border-accent/40 bg-warn-bg p-4 text-warn-ink">
          <p className="text-xs font-semibold">Esta semana não deu para tudo</p>
          <p className="mt-1 font-display text-4xl font-extrabold">Faltaram {formatEUR(d.shortfallCents)}</p>
          <p className="mt-2 text-xs">
            {billsCovered ? "As contas estão garantidas. " : "Nem todas as contas foram cobertas. "}
            O dia a dia ficou curto{goalsPaused ? " e as metas foram pausadas nesta semana" : ""}.
          </p>
        </section>

        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          <SummaryRow title="Contas fixas" sub={billsCovered ? "Totalmente cobertas" : "Parcialmente cobertas"} value={d.billsCents} />
          <SummaryRow
            title="Dia a dia"
            sub={`${formatEUR(d.shortfallCents)} abaixo dos ${formatEUR(sim.weeklyLivingCents)}`}
            value={d.livingCents}
          />
          <SummaryRow title="Metas" sub={goalsPaused ? "Pausadas nesta semana" : "Parcialmente"} value={d.goalsCents} />
        </ul>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-bold">O que você prefere?</legend>
          {canUseReserve && reserve && (
            <Option
              checked={option === "reserve"}
              onChange={() => setOption("reserve")}
              title={`Usar ${formatEUR(reserve.withdrawalCents)} da reserva de emergência`}
              sub={`A reserva vai de ${formatEUR(reserve.reserveBeforeCents)} para ${formatEUR(reserve.reserveAfterCents)}. Livre: ${formatEUR(reserve.freeCents)}.`}
            />
          )}
          <Option
            checked={option === "less"}
            onChange={() => setOption("less")}
            title="Seguir com menos esta semana"
            sub={`Livre: ${formatEUR(d.freeCents)}. Nada sai das metas.`}
          />
        </fieldset>
        {error && (
          <p role="alert" className="text-center text-sm text-warn-ink">
            {error}
          </p>
        )}
      </main>
      <footer className="sticky bottom-0 bg-canvas px-5 pt-3 pb-5">
        <Button disabled={pending} onClick={confirm}>
          {pending ? "Salvando…" : "Confirmar"}
        </Button>
      </footer>
    </div>
  );
}

function SummaryRow({ title, sub, value }: { title: string; sub: string; value: number }) {
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-brand">{sub}</span>
      </span>
      <span className="font-extrabold">{formatEUR(value)}</span>
    </li>
  );
}

function Option({
  checked,
  onChange,
  title,
  sub,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  sub: string;
}) {
  return (
    <label
      className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-card border-2 bg-surface p-4 ${
        checked ? "border-brand" : "border-line"
      }`}
    >
      <input type="radio" name="option" checked={checked} onChange={onChange} className="mt-1 size-4 accent-brand" />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
    </label>
  );
}
