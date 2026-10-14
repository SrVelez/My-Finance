import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConfirmPayment } from "@/components/ConfirmPayment";
import { FlowHeader } from "@/components/FlowHeader";
import { HistoryList } from "@/components/HistoryList";
import { MoveMoney } from "@/components/MoveMoney";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { dueSoonLabel } from "@/lib/dueLabel";
import { formatDateChip, weekdayShort } from "@/lib/engine";
import { formatEUR } from "@/lib/money";
import { getBillDetail } from "@/lib/services/history";
import { serverToday } from "@/lib/services/today";

export default function ContaPage({ params }: PageProps<"/contas/[id]">) {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy />}>
      <Conta params={params} />
    </Suspense>
  );
}

async function Conta({ params }: { params: PageProps<"/contas/[id]">["params"] }) {
  const { id } = await params;
  const today = await serverToday();
  const detail = await getBillDetail(id, today);
  if (!detail) notFound();
  const { bill, history } = detail;
  const overdue = bill.open?.kind === "overdue";
  const soon = dueSoonLabel(bill.daysLeft);
  const falta = bill.targetCents - bill.savedCents;

  return (
    <div className="flex flex-1 flex-col">
      <FlowHeader
        title={bill.name}
        backHref="/contas"
        action={
          <Link
            href={`/contas/${bill.id}/editar`}
            aria-label="Editar conta"
            className="flex size-11 items-center justify-center rounded-full text-2xl leading-none font-bold"
          >
            ⋮
          </Link>
        }
      />
      <main className="flex-1 space-y-6 px-5 pt-4 pb-8">
        {bill.open && <ConfirmPayment billId={bill.id} name={bill.name} open={bill.open} />}

        <section className="space-y-3 rounded-card border border-line bg-surface p-4">
          <div>
            <p className={`text-xs ${soon && !bill.covered ? "font-semibold text-warn-ink" : "text-muted"}`}>
              {overdue ? "Venceu" : soon ? `${soon} ·` : "Vence"} {weekdayShort(bill.due).toLowerCase()},{" "}
              {formatDateChip(bill.due, "")}
            </p>
            <p className="font-display text-4xl font-extrabold">{formatEUR(bill.amountCents)}</p>
          </div>
          <ProgressBar label={`Guardado para ${bill.name}`} value={bill.savedCents} max={bill.targetCents} />
          <p className={`text-xs ${bill.covered ? "font-semibold text-brand" : "text-muted"}`}>
            {bill.covered
              ? "✓ Valor todo guardado"
              : `${formatEUR(bill.savedCents)} guardados · faltam ${formatEUR(falta)}`}
          </p>
          {soon && !bill.covered && !overdue && (
            <p className="text-xs text-warn-ink">
              {bill.receiptsLeft <= 1
                ? "Só dá para separar no próximo recebimento antes do vencimento."
                : `Ainda cabem ${bill.receiptsLeft} recebimentos até o vencimento.`}
            </p>
          )}
        </section>

        <MoveMoney kind="bill" id={bill.id} canIn={!bill.covered} canOut={bill.savedCents > 0} />

        <section>
          <h2 className="mb-2 font-bold">Extrato</h2>
          <HistoryList days={history} today={today} empty="Nada foi guardado para esta conta ainda." />
        </section>
      </main>
    </div>
  );
}
