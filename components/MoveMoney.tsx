"use client";

import { useState, useTransition } from "react";
import { moveMoneyAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/Button";
import { MoneyField } from "@/components/ui/MoneyField";

/**
 * Guardar / retirar dinheiro à mão. "Guardar" sai do livre da semana e
 * "Retirar" volta para ele; o saldo nunca é editado direto (o extrato fecha sempre).
 */
export function MoveMoney({
  kind,
  id,
  canIn,
  canOut,
}: {
  kind: "bill" | "goal";
  id: string;
  canIn: boolean;
  canOut: boolean;
}) {
  const [direction, setDirection] = useState<"in" | "out" | null>(null);
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setDirection(null);
    setAmount(0);
    setError(null);
  };

  const submit = () =>
    startTransition(async () => {
      if (!direction) return;
      setError(null);
      const result = await moveMoneyAction(kind, id, direction, amount);
      if (result.ok) close();
      else setError(result.error);
    });

  if (!direction) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" disabled={!canIn} onClick={() => setDirection("in")}>
          + Guardar
        </Button>
        <Button variant="outline" disabled={!canOut} onClick={() => setDirection("out")}>
          − Retirar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-4">
      <p className="text-sm font-semibold">
        {direction === "in" ? "Guardar do seu livre da semana" : "Retirar e devolver ao seu livre"}
      </p>
      <MoneyField
        key={direction}
        label={direction === "in" ? "Valor a guardar" : "Valor a retirar"}
        value={amount}
        onChange={setAmount}
      />
      {error && (
        <p role="alert" className="text-sm font-semibold text-warn-ink">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" disabled={pending} onClick={close}>
          Cancelar
        </Button>
        <Button disabled={pending || amount <= 0} onClick={submit}>
          {pending ? "Salvando…" : "Confirmar"}
        </Button>
      </div>
    </div>
  );
}
