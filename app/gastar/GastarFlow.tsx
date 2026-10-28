"use client";

import { useState } from "react";
import { FlowHeader } from "@/components/FlowHeader";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { FormError } from "@/components/ui/FormError";
import { Keypad, useAmountInput } from "@/components/ui/Keypad";
import { useAction } from "@/components/ui/useAction";
import { amountCents, displayAmount } from "@/lib/amount";
import { CATEGORIES, type Category } from "@/lib/categories";
import { formatEUR } from "@/lib/money";
import { todayISO } from "@/lib/today";
import { registerExpenseAction } from "./actions";

export function GastarFlow({ freeLeftCents }: { freeLeftCents: number }) {
  const { text, press } = useAmountInput();
  const [category, setCategory] = useState<Category>("Mercado");
  const { run, pending, error } = useAction("Não foi possível registrar. Tente de novo.");

  const cents = amountCents(text);
  const left = freeLeftCents - cents;

  const submit = () => run(() => registerExpenseAction(cents, category, todayISO()));

  return (
    <div className="flex flex-1 flex-col">
      <FlowHeader title="Gastei" />
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-5">
        <p className="text-sm text-muted">Quanto você gastou?</p>
        <p className="font-display text-6xl font-extrabold" aria-live="polite" data-testid="amount">
          {displayAmount(text)}
        </p>
        <p className={`text-xs ${left < 0 ? "font-semibold text-warn-ink" : "text-muted"}`} data-testid="left">
          {left < 0
            ? `Passa ${formatEUR(-left)} do livre desta semana`
            : `Sobram ${formatEUR(left)} livres esta semana`}
        </p>
      </main>
      <div className="space-y-3 px-5 pb-5">
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Categoria">
          {CATEGORIES.map((c) => (
            <Chip key={c} selected={category === c} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>
        {error && <FormError center>{error}</FormError>}
        <Keypad onPress={press} />
        <Button disabled={cents <= 0 || pending} onClick={submit}>
          {pending ? "Registrando…" : "Registrar gasto"}
        </Button>
      </div>
    </div>
  );
}
