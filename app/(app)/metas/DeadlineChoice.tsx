"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { MoneyField } from "@/components/ui/MoneyField";
import { formatEUR } from "@/lib/money";
import type { DeadlineChoice } from "@/lib/services/goals";
import { resolveGoalDeadlineAction } from "./actions";

type Kind = DeadlineChoice["type"];

/** Meta cujo prazo venceu sem completar: o app pergunta o que fazer (enquanto isso ela fica pausada). */
export function DeadlineChoicePanel({
  goalId,
  deadlineLabel,
  savedCents,
  targetCents,
  minMonth,
}: {
  goalId: string;
  deadlineLabel: string;
  savedCents: number;
  targetCents: number;
  minMonth: string;
}) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [month, setMonth] = useState("");
  const [target, setTarget] = useState(targetCents);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const options: { kind: Kind; title: string; hint: string; hidden?: boolean }[] = [
    { kind: "extend", title: "Estender o prazo", hint: "Escolha um novo mês; o valor semanal é recalculado." },
    { kind: "target", title: "Ajustar o valor-alvo", hint: "Mude quanto quer juntar; a meta segue sem prazo." },
    { kind: "none", title: "Continuar sem prazo", hint: "Mantém o alvo e usa um valor semanal." },
    {
      kind: "complete",
      title: `Concluir com o que juntei (${formatEUR(savedCents)})`,
      hint: "A meta fica completa com o valor guardado.",
      hidden: savedCents <= 0,
    },
  ];

  const ready = kind === "extend" ? month !== "" : kind === "target" ? target > 0 : kind !== null;

  const submit = () =>
    startTransition(async () => {
      if (!kind) return;
      setError(null);
      const choice: DeadlineChoice =
        kind === "extend"
          ? { type: "extend", deadline: month }
          : kind === "target"
            ? { type: "target", targetCents: target }
            : { type: kind };
      const result = await resolveGoalDeadlineAction(goalId, choice);
      if (!result.ok) setError(result.error);
    });

  return (
    <section
      role="group"
      aria-label="O prazo da meta venceu"
      className="space-y-3 rounded-card border border-accent/50 bg-warn-bg p-4 text-warn-ink"
    >
      <div>
        <p className="font-semibold">O prazo de {deadlineLabel} passou</p>
        <p className="mt-0.5 text-sm">Esta meta está pausada. O que você prefere fazer?</p>
      </div>

      <div className="grid gap-2" role="radiogroup" aria-label="Opções">
        {options
          .filter((o) => !o.hidden)
          .map((o) => (
            <button
              key={o.kind}
              type="button"
              role="radio"
              aria-checked={kind === o.kind}
              onClick={() => setKind(o.kind)}
              className={`min-h-12 rounded-xl border-2 bg-surface px-3 py-2 text-left text-ink ${
                kind === o.kind ? "border-brand" : "border-line"
              }`}
            >
              <span className="block text-sm font-semibold">{o.title}</span>
              <span className="block text-xs text-muted">{o.hint}</span>
            </button>
          ))}
      </div>

      {kind === "extend" && (
        <label className="block text-xs">
          Novo prazo
          <input
            type="month"
            min={minMonth}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base font-semibold text-ink"
          />
        </label>
      )}
      {kind === "target" && (
        <label className="block text-xs">
          Novo valor-alvo
          <MoneyField label="Novo valor-alvo" value={target} onChange={setTarget} className="mt-1 bg-surface" />
        </label>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold">
          {error}
        </p>
      )}
      <Button disabled={!ready || pending} onClick={submit}>
        {pending ? "Salvando…" : "Confirmar"}
      </Button>
    </section>
  );
}
