"use client";

import { useState, useTransition } from "react";
import { FlowHeader } from "@/components/FlowHeader";
import { Button } from "@/components/ui/Button";
import { MoneyField } from "@/components/ui/MoneyField";
import { createBillAction, deleteBillAction, updateBillAction } from "./actions";

interface Props {
  bill?: { id: string; name: string; amountCents: number; dueDay: number };
}

export function BillForm({ bill }: Props) {
  const [name, setName] = useState(bill?.name ?? "");
  const [amountCents, setAmountCents] = useState(bill?.amountCents ?? 0);
  const [dueDay, setDueDay] = useState(bill?.dueDay ?? 1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const valid = name.trim() !== "" && amountCents > 0 && dueDay >= 1 && dueDay <= 31;

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        // redirect() é lançado internamente pelo Next; só mostramos falhas reais.
        if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
        setError("Não foi possível salvar. Tente de novo.");
      }
    });

  const save = () =>
    run(() =>
      bill
        ? updateBillAction(bill.id, { name, amountCents, dueDay })
        : createBillAction({ name, amountCents, dueDay }),
    );

  return (
    <div className="flex flex-1 flex-col">
      <FlowHeader title={bill ? "Editar conta" : "Nova conta"} closeHref={bill ? `/contas/${bill.id}` : "/contas"} />
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
            Valor
            <MoneyField label="Valor da conta" value={amountCents} onChange={setAmountCents} className="mt-1 bg-surface" />
          </div>
          <label className="text-xs text-muted">
            Vence todo dia
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              value={dueDay}
              onChange={(e) => setDueDay(Number(e.target.value))}
              className="mt-1 min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-lg font-bold text-ink"
            />
          </label>
        </div>
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
        {bill &&
          (confirmDelete ? (
            <Button variant="outline" className="border-warn-ink text-warn-ink" disabled={pending} onClick={() => run(() => deleteBillAction(bill.id))}>
              Confirmar exclusão
            </Button>
          ) : (
            <Button variant="ghost" className="text-warn-ink" onClick={() => setConfirmDelete(true)}>
              Excluir conta
            </Button>
          ))}
      </footer>
    </div>
  );
}
