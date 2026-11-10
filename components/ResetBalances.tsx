"use client";

import { useState, useTransition } from "react";
import { resetAllBalancesAction, undoBatchAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { UndoToast } from "@/components/UndoToast";
import { RESET_WORD } from "@/lib/validate";

/**
 * "Recomeçar saldos": zera o saldo de todas as contas e metas, mantendo nomes, valores, prazos,
 * prioridades e histórico. Confirmação forte (digitar ZERAR) e desfazer em lote por 10 segundos.
 */
export function ResetBalances() {
  const [confirming, setConfirming] = useState(false);
  const [word, setWord] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [toast, setToast] = useState<{ groupId: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const cancel = () => {
    setConfirming(false);
    setWord("");
    setError(null);
  };

  const submit = () =>
    startTransition(async () => {
      setError(null);
      setInfo(null);
      const result = await resetAllBalancesAction(word);
      if (!result.ok) return setError(result.error);
      cancel();
      if (result.count === 0) setInfo("Nenhuma conta ou meta tem saldo para zerar.");
      else setToast({ groupId: result.groupId });
    });

  return (
    <section className="space-y-3 rounded-card border border-line bg-surface p-4">
      <h2 className="font-bold">Recomeçar saldos</h2>
      <p className="text-xs text-muted">
        Zera o saldo de todas as contas e metas, mas mantém nomes, valores, prazos, prioridades e o histórico. Não apaga seus dados.
      </p>
      {confirming ? (
        <div className="space-y-3">
          <label className="block text-xs text-muted">
            Para confirmar, digite {RESET_WORD}
            <input
              value={word}
              autoComplete="off"
              autoCapitalize="characters"
              onChange={(e) => setWord(e.target.value)}
              className="mt-1 min-h-12 w-full rounded-xl border border-line bg-canvas px-3 text-base font-semibold text-ink"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" disabled={pending} onClick={cancel}>
              Cancelar
            </Button>
            <Button variant="outline" className="border-warn-ink text-warn-ink" disabled={pending || word !== RESET_WORD} onClick={submit}>
              {pending ? "Zerando…" : "Zerar saldos"}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setConfirming(true)}>
          Recomeçar saldos
        </Button>
      )}
      {error && <FormError>{error}</FormError>}
      {info && (
        <p role="status" className="text-sm font-semibold text-brand">
          {info}
        </p>
      )}
      {toast && (
        <UndoToast
          key={toast.groupId}
          message="Saldos zerados"
          onUndo={() => undoBatchAction(toast.groupId)}
          onClose={() => setToast(null)}
        />
      )}
    </section>
  );
}
