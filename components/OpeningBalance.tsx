"use client";

import { useState, type ReactNode } from "react";
import { FormError } from "@/components/ui/FormError";
import { MoneyField } from "@/components/ui/MoneyField";
import {
  checkBillOpening,
  checkGoalOpening,
  formatDayMonth,
  formatMonthYear,
  lastDueOnOrBefore,
  planBill,
  planGoal,
  settleBill,
  type BillOpeningInput,
} from "@/lib/engine";
import { formatEUR, type Cents } from "@/lib/money";
import { todayISO } from "@/lib/today";

function Choice({ checked, onSelect, children }: { checked: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm font-semibold ${
        checked ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface text-ink"
      }`}
    >
      <span aria-hidden className={`size-4 shrink-0 rounded-full border-2 ${checked ? "border-brand bg-brand" : "border-neutral-bar"}`} />
      {children}
    </button>
  );
}

/** Meta nova: "Você já tem algum valor guardado para isso?". */
export function GoalOpening({
  value,
  onChange,
  targetCents,
  deadline,
  weeklyCents,
}: {
  value: Cents;
  onChange: (cents: Cents) => void;
  targetCents: Cents;
  deadline: string | null;
  /** Valor semanal da meta sem prazo. */
  weeklyCents: Cents;
}) {
  const [has, setHas] = useState(value > 0);
  const check = checkGoalOpening(value, targetCents);
  const falta = Math.max(0, targetCents - value);

  let effect: string | null = null;
  if (has && value > 0 && targetCents > 0) {
    if (check.ok && check.completes) {
      effect = "Isso já completa a meta.";
    } else if (deadline) {
      const plan = planGoal(
        { id: "preview", name: "", targetCents, savedCents: value, deadline, weeklyCents: 0, priority: 1, isEmergency: false },
        todayISO(),
      );
      effect = `Faltam ${formatEUR(falta)}. Com prazo em ${formatMonthYear(deadline)}, são ${formatEUR(plan.amountCents)} por semana.`;
    } else if (weeklyCents > 0) {
      effect = `Faltam ${formatEUR(falta)}. Com ${formatEUR(Math.min(weeklyCents, falta))} por semana, completa em cerca de ${Math.ceil(falta / weeklyCents)} semanas.`;
    } else {
      effect = `Faltam ${formatEUR(falta)}.`;
    }
  }

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-bold">Você já tem algum valor guardado para isso?</legend>
      <div role="radiogroup" aria-label="Saldo inicial da meta" className="space-y-2">
        <Choice
          checked={!has}
          onSelect={() => {
            setHas(false);
            onChange(0);
          }}
        >
          Não, começar do zero
        </Choice>
        <Choice checked={has} onSelect={() => setHas(true)}>
          Sim, já tenho
        </Choice>
      </div>
      {has && (
        <div className="space-y-2">
          <p className="text-xs text-muted">Quanto já está guardado?</p>
          <MoneyField label="Quanto já está guardado?" value={value} onChange={onChange} className="bg-surface" />
          <p className="text-xs text-muted">Use o valor que aparece no app do seu banco.</p>
          {effect && (
            <p className={`text-xs font-semibold ${check.ok && check.completes ? "text-brand" : "text-ink"}`} data-testid="opening-effect">
              {effect}
            </p>
          )}
          {!check.ok && <FormError>{check.error}</FormError>}
        </div>
      )}
    </fieldset>
  );
}

/** Conta nova: "Para o próximo vencimento (dia X), você já tem algo separado?". */
export function BillOpening({
  value,
  onChange,
  amountCents,
  dueDay,
  today: todayProp,
}: {
  value: BillOpeningInput;
  onChange: (opening: BillOpeningInput) => void;
  amountCents: Cents;
  dueDay: number;
  /** Data do servidor; sem ela, usa a do aparelho (só no onboarding, depois da hidratação). */
  today?: string;
}) {
  const today = todayProp || todayISO();
  const dueOk = dueDay >= 1 && dueDay <= 31;
  // "Já paguei este mês" só aparece se o vencimento deste mês já passou ou é hoje.
  const paidAllowed = dueOk && lastDueOnOrBefore(dueDay, today).slice(0, 7) === today.slice(0, 7);
  const check = checkBillOpening(value, amountCents, dueDay, today);

  let effect: string | null = null;
  if (value.mode === "partial" && value.cents > 0 && amountCents > 0 && check.ok) {
    const plan = planBill(
      settleBill(
        {
          id: "preview",
          name: "",
          amountCents,
          dueDay,
          savedCents: value.cents,
          paidThrough: null,
          consumedCents: 0,
          unpaidDue: null,
          unpaidCents: 0,
          confirmedThrough: null,
          createdOn: today,
        },
        today,
      ),
      today,
    );
    effect = `Faltam ${formatEUR(amountCents - value.cents)} até ${formatDayMonth(plan.due)}.`;
  }

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-bold">Para o próximo vencimento (dia {dueOk ? dueDay : "…"}), você já tem algo separado?</legend>
      <div role="radiogroup" aria-label="Saldo inicial da conta" className="space-y-2">
        <Choice checked={value.mode === "none"} onSelect={() => onChange({ mode: "none" })}>
          Não, começar do zero
        </Choice>
        <Choice checked={value.mode === "partial"} onSelect={() => onChange({ mode: "partial", cents: value.mode === "partial" ? value.cents : 0 })}>
          Sim, já tenho uma parte
        </Choice>
        {paidAllowed && (
          <Choice checked={value.mode === "paid"} onSelect={() => onChange({ mode: "paid" })}>
            Já paguei este mês
          </Choice>
        )}
      </div>
      {value.mode === "partial" && (
        <div className="space-y-2">
          <MoneyField
            label="Quanto já está separado para esta conta?"
            value={value.cents}
            onChange={(cents) => onChange({ mode: "partial", cents })}
            className="bg-surface"
          />
          <p className="text-xs text-muted">Use o valor que aparece no app do seu banco.</p>
          {effect && (
            <p className="text-xs font-semibold" data-testid="opening-effect">
              {effect}
            </p>
          )}
        </div>
      )}
      {value.mode === "paid" && <p className="text-xs text-muted">Tudo certo: o próximo vencimento começa com €0 guardado.</p>}
      {!check.ok && <FormError>{check.error}</FormError>}
    </fieldset>
  );
}
