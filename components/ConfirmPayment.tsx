"use client";

import { useState, useTransition } from "react";
import { confirmPaymentAction } from "@/app/(app)/contas/actions";
import { Button } from "@/components/ui/Button";
import { MoneyField } from "@/components/ui/MoneyField";
import { formatDateChip } from "@/lib/engine";
import { formatEUR } from "@/lib/money";
import type { OpenDue } from "@/lib/services/bills";

/**
 * "Você pagou?": o app não adivinha se a conta foi paga, pergunta.
 * - Paguei tudo: o que não estava guardado sai do livre da semana.
 * - Paguei outro valor: o resto continua em atraso.
 * - Ainda não paguei: vira atraso e o próximo recebimento separa o que falta.
 */
export function ConfirmPayment({ billId, name, open }: { billId: string; name: string; open: OpenDue }) {
  const [other, setOther] = useState(false);
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const overdue = open.kind === "overdue";
  const missing = Math.max(open.owedCents - open.fundsCents, 0);

  const send = (paidCents: number | null) =>
    startTransition(async () => {
      setError(null);
      const result = await confirmPaymentAction(billId, paidCents);
      if (!result.ok) return setError(result.error);
      // O cartão pode continuar na tela (pagamento parcial): volta aos botões.
      setOther(false);
      setAmount(0);
    });

  return (
    <div
      role="group"
      aria-label={`Confirmar pagamento de ${name}`}
      className="space-y-3 rounded-card border border-accent/50 bg-warn-bg p-4 text-warn-ink"
    >
      <div>
        <p className="font-semibold">
          {name} {overdue ? "está em atraso" : `venceu ${formatDateChip(open.due, "")}`}
        </p>
        <p className="mt-0.5 text-sm">{overdue ? "Você já pagou?" : "Você pagou?"}</p>
        <p className="mt-1 text-xs">
          {overdue ? "Falta pagar" : "Valor"} {formatEUR(open.owedCents)} · guardado {formatEUR(open.fundsCents)}
          {missing > 0 && ` · ${formatEUR(missing)} saem do seu livre se você pagou tudo`}
        </p>
      </div>

      {other ? (
        <div className="space-y-2">
          <label className="block text-xs">
            Quanto você pagou?
            <MoneyField label="Valor pago" value={amount} onChange={setAmount} className="mt-1 bg-surface" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={pending} onClick={() => setOther(false)}>
              Cancelar
            </Button>
            <Button disabled={pending || amount <= 0} onClick={() => send(amount)}>
              Confirmar
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <Button disabled={pending} onClick={() => send(null)}>
            {overdue ? "Paguei" : "Paguei tudo"}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="text-sm" disabled={pending} onClick={() => setOther(true)}>
              Paguei outro valor
            </Button>
            {!overdue && (
              <Button variant="outline" className="text-sm" disabled={pending} onClick={() => send(0)}>
                Ainda não paguei
              </Button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
