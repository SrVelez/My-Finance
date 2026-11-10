"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { adjustBalanceAction, undoAdjustmentAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { MoneyField } from "@/components/ui/MoneyField";
import { UndoToast } from "@/components/UndoToast";
import {
  checkAdjustment,
  previewBillAdjustment,
  previewGoalAdjustment,
  type AdjustReason,
  type EngineBill,
  type EngineGoal,
} from "@/lib/engine";
import { formatEUR, type Cents } from "@/lib/money";

const WHEN_DECREASE: { value: AdjustReason; label: string }[] = [
  { value: "match_bank", label: "Ajustar para bater com meu banco" },
  { value: "used", label: "O dinheiro foi usado" },
  { value: "return_to_free", label: "Devolver para o livre da semana" },
];
const WHEN_INCREASE: { value: AdjustReason; label: string }[] = [
  { value: "match_bank", label: "Já estava guardado, só ajustar" },
  { value: "from_free", label: "Tirar do livre da semana" },
];

interface Props {
  kind: "bill" | "goal";
  id: string;
  name: string;
  /** Saldo atual no Finança. */
  haveCents: Cents;
  /** Contas: teto do novo saldo (o valor do vencimento). */
  maxCents?: Cents;
  /** Livre que ainda há na semana. */
  freeLeftCents: Cents;
  today: string;
  /** Estado do motor, para a prévia do que muda no plano. */
  engineGoal?: EngineGoal;
  engineBill?: EngineBill;
}

/** "Ajustar saldo": folha inferior para corrigir o saldo (ou zerar) com motivo, prévia e desfazer. */
export function AdjustBalance({ kind, id, name, haveCents, maxCents, freeLeftCents, today, engineGoal, engineBill }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [newCents, setNewCents] = useState(haveCents);
  const [fieldKey, setFieldKey] = useState(0);
  const [zeroed, setZeroed] = useState(false);
  const [chosen, setChosen] = useState<AdjustReason>("match_bank");
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ adjustmentId: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const delta = newCents - haveCents;
  const options = delta < 0 ? WHEN_DECREASE : delta > 0 ? WHEN_INCREASE : [];
  const reason: AdjustReason = zeroed ? "reset" : options.some((o) => o.value === chosen) ? chosen : (options[0]?.value ?? "match_bank");
  const check = checkAdjustment({ haveCents, newBalanceCents: newCents, reason, freeLeftCents, maxCents });

  const preview = check.ok
    ? engineGoal
      ? previewGoalAdjustment(engineGoal, newCents, today)
      : engineBill
        ? previewBillAdjustment(engineBill, newCents, today)
        : null
    : null;

  const effect = (() => {
    if (!preview) return null;
    if (kind === "goal") {
      const weekly =
        preview.weeklyBeforeCents === preview.weeklyAfterCents
          ? `O valor semanal continua ${formatEUR(preview.weeklyAfterCents)}.`
          : `O valor semanal passa de ${formatEUR(preview.weeklyBeforeCents)} para ${formatEUR(preview.weeklyAfterCents)}.`;
      return `A meta vai de ${preview.pctBefore}% para ${preview.pctAfter}%. ${preview.faltaAfterCents === 0 ? "Ela fica concluída." : weekly}`;
    }
    if (preview.faltaAfterCents === 0) return "O valor da conta fica todo guardado.";
    return newCents === 0
      ? `A conta volta a precisar de ${formatEUR(preview.weeklyAfterCents)} por semana.`
      : `Faltam ${formatEUR(preview.faltaAfterCents)}. A conta passa a precisar de ${formatEUR(preview.weeklyAfterCents)} por semana.`;
  })();

  const start = () => {
    setNewCents(haveCents);
    setFieldKey((k) => k + 1);
    setZeroed(false);
    setChosen("match_bank");
    setConfirmingReset(false);
    setError(null);
    setOpen(true);
  };
  const close = () => setOpen(false);

  const zero = () => {
    setNewCents(0);
    setFieldKey((k) => k + 1);
    setZeroed(true);
    setConfirmingReset(false);
  };

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await adjustBalanceAction(kind, id, newCents, reason);
      if (result.ok) {
        close();
        setToast({ adjustmentId: result.adjustmentId });
      } else {
        setError(result.error);
      }
    });

  const confirm = () => (zeroed && !confirmingReset ? setConfirmingReset(true) : submit());

  return (
    <>
      <Button variant="outline" onClick={start}>
        Ajustar saldo
      </Button>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-label={`Ajustar saldo de ${name}`}
        className="mx-auto mt-auto mb-0 w-full max-w-[430px] rounded-t-2xl bg-surface p-5 text-ink backdrop:bg-black/40"
      >
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-extrabold">Ajustar saldo</h2>
            <p className="text-sm text-muted" data-testid="current-balance">
              Saldo atual no Finança: <strong className="text-ink">{formatEUR(haveCents)}</strong>
            </p>
          </div>

          {confirmingReset ? (
            <div role="alert" className="space-y-1 rounded-card border border-accent/40 bg-warn-bg p-4 text-warn-ink">
              <p className="font-bold">Zerar {name}?</p>
              <p className="text-sm">
                O saldo vai de {formatEUR(haveCents)} para €0. O histórico fica guardado.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Novo saldo</span>
                  <button
                    type="button"
                    onClick={zero}
                    disabled={haveCents === 0}
                    className="min-h-11 px-2 text-sm font-bold text-brand disabled:text-neutral-bar"
                  >
                    Zerar
                  </button>
                </div>
                <MoneyField
                  key={fieldKey}
                  label="Novo saldo"
                  value={newCents}
                  onChange={(c) => {
                    setNewCents(c);
                    setZeroed(false);
                  }}
                />
              </div>

              {!zeroed && options.length > 0 && (
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm font-bold">
                    {delta < 0
                      ? `O que aconteceu com a diferença de ${formatEUR(-delta)}?`
                      : `De onde veio a diferença de ${formatEUR(delta)}?`}
                  </legend>
                  <div role="radiogroup" className="space-y-2">
                    {options.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={reason === o.value}
                        onClick={() => setChosen(o.value)}
                        className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm font-semibold ${
                          reason === o.value ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface"
                        }`}
                      >
                        <span aria-hidden className={`size-4 shrink-0 rounded-full border-2 ${reason === o.value ? "border-brand bg-brand" : "border-neutral-bar"}`} />
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {delta > 0 && <p className="text-xs text-muted">Livre disponível esta semana: {formatEUR(Math.max(freeLeftCents, 0))}</p>}
                </fieldset>
              )}

              {delta !== 0 && !check.ok && <FormError>{check.error}</FormError>}
              {effect && (
                <p className="text-sm text-muted" data-testid="adjust-effect">
                  {effect}
                </p>
              )}
            </>
          )}

          {error && <FormError>{error}</FormError>}

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" disabled={pending} onClick={confirmingReset ? () => setConfirmingReset(false) : close}>
              {confirmingReset ? "Voltar" : "Cancelar"}
            </Button>
            <Button disabled={pending || !check.ok} onClick={confirm}>
              {pending ? "Salvando…" : confirmingReset ? "Sim, zerar" : "Confirmar"}
            </Button>
          </div>
        </div>
      </dialog>

      {toast && (
        <UndoToast
          key={toast.adjustmentId}
          message="Saldo ajustado"
          onUndo={() => undoAdjustmentAction(toast.adjustmentId)}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
