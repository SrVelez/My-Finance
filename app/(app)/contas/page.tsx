import Link from "next/link";
import { Suspense } from "react";
import { ConfirmPayment } from "@/components/ConfirmPayment";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { dueSoonLabel } from "@/lib/dueLabel";
import { formatDateChip, weekdayShort } from "@/lib/engine";
import { formatEUR } from "@/lib/money";
import { listBills } from "@/lib/services/bills";
import { serverToday } from "@/lib/services/today";

export default function ContasPage() {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy />}>
      <Contas />
    </Suspense>
  );
}

const dueLabel = (due: string) => `${weekdayShort(due).toLowerCase()}, ${formatDateChip(due, "")}`;

async function Contas() {
  const today = await serverToday();
  const { totalCents, upcoming, paid } = await listBills(today);
  // Em atraso e "a confirmar" pedem uma resposta; as demais seguem em "Próximas".
  const overdue = upcoming.filter((b) => b.open?.kind === "overdue");
  const toConfirm = upcoming.filter((b) => b.open?.kind === "pending");
  const next = upcoming.filter((b) => b.open?.kind !== "overdue");

  return (
    <main className="flex-1 space-y-6 px-5 pt-5 pb-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Contas</h1>
          <p className="mt-1 text-xs text-muted">
            {formatEUR(totalCents)} por mês · {upcoming.length} {upcoming.length === 1 ? "conta fixa" : "contas fixas"}
          </p>
        </div>
        <Link
          href="/contas/nova"
          aria-label="Nova conta"
          className="flex size-11 items-center justify-center rounded-full bg-brand text-2xl font-bold text-white"
        >
          +
        </Link>
      </header>

      {upcoming.length === 0 && <p className="text-sm text-muted">Nenhuma conta ainda. Toque em + para adicionar.</p>}

      {overdue.length > 0 && (
        <Section title="EM ATRASO">
          {overdue.map((b) => (
            <li key={b.id}>
              <ConfirmPayment billId={b.id} name={b.name} open={b.open!} />
            </li>
          ))}
        </Section>
      )}

      {toConfirm.length > 0 && (
        <Section title="A CONFIRMAR">
          {toConfirm.map((b) => (
            <li key={b.id}>
              <ConfirmPayment billId={b.id} name={b.name} open={b.open!} />
            </li>
          ))}
        </Section>
      )}

      {next.length > 0 && (
        <Section title="PRÓXIMAS">
          {next.map((b) => {
            const soon = dueSoonLabel(b.daysLeft);
            const short = soon && !b.covered;
            const falta = b.targetCents - b.savedCents;
            return (
              <li key={b.id}>
                <Link href={`/contas/${b.id}`} className="block space-y-2 rounded-card border border-line bg-surface p-4">
                  <span className="flex items-start justify-between">
                    <span>
                      <span className="block font-semibold">{b.name}</span>
                      <span className={`block text-xs ${short ? "font-semibold text-warn-ink" : "text-muted"}`}>
                        {soon ? `${soon} · ` : "Vence "}
                        {dueLabel(b.due)}
                      </span>
                    </span>
                    <span className="text-lg font-extrabold">{formatEUR(b.amountCents)}</span>
                  </span>
                  <ProgressBar label={`Guardado para ${b.name}`} value={b.savedCents} max={b.targetCents} />
                  <span className={`block text-xs ${b.covered ? "font-semibold text-brand" : "text-muted"}`}>
                    {b.covered
                      ? "✓ Valor todo guardado"
                      : `${formatEUR(b.savedCents)} guardados · faltam ${formatEUR(falta)}`}
                  </span>
                  {short && (
                    <span className="block text-xs text-warn-ink">
                      {b.receiptsLeft <= 1
                        ? "Só dá para separar no próximo recebimento antes do vencimento."
                        : `Ainda cabem ${b.receiptsLeft} recebimentos até o vencimento.`}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </Section>
      )}

      {paid.length > 0 && (
        <Section title="JÁ VENCERAM">
          {paid.map((b) => (
            <li key={b.id}>
              <Link
                href={`/contas/${b.id}`}
                className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4"
              >
                <span>
                  <span className="block font-semibold">
                    {b.name} · {formatEUR(b.amountCents)}
                  </span>
                  <span className="block text-xs text-muted">{formatDateChip(b.confirmedThrough, "")} · pagamento confirmado</span>
                </span>
                <span aria-hidden className="font-bold text-brand">
                  ✓
                </span>
              </Link>
            </li>
          ))}
        </Section>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-muted">{title}</h2>
      <ul className="space-y-3">{children}</ul>
    </section>
  );
}
