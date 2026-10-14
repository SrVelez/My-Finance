import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FlowHeader } from "@/components/FlowHeader";
import { HistoryList } from "@/components/HistoryList";
import { MoveMoney } from "@/components/MoveMoney";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatMonthYear } from "@/lib/engine";
import { goalStatus } from "@/lib/goalStatus";
import { formatEUR } from "@/lib/money";
import { getGoalDetail } from "@/lib/services/history";
import { serverToday } from "@/lib/services/today";
import { DeadlineChoicePanel } from "../DeadlineChoice";

export default function MetaPage({ params }: PageProps<"/metas/[id]">) {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy />}>
      <Meta params={params} />
    </Suspense>
  );
}

async function Meta({ params }: { params: PageProps<"/metas/[id]">["params"] }) {
  const { id } = await params;
  const today = await serverToday();
  const detail = await getGoalDetail(id, today);
  if (!detail) notFound();
  const { goal, history } = detail;
  const pct = goal.targetCents > 0 ? Math.round((goal.savedCents / goal.targetCents) * 100) : 0;
  const status = goalStatus(goal);

  return (
    <div className="flex flex-1 flex-col">
      <FlowHeader
        title={goal.name}
        backHref="/metas"
        action={
          <Link
            href={`/metas/${goal.id}/editar`}
            aria-label="Editar meta"
            className="flex size-11 items-center justify-center rounded-full text-2xl leading-none font-bold"
          >
            ⋮
          </Link>
        }
      />
      <main className="flex-1 space-y-6 px-5 pt-4 pb-8">
        {goal.pastDeadline && goal.deadline && (
          <DeadlineChoicePanel
            goalId={goal.id}
            deadlineLabel={formatMonthYear(goal.deadline)}
            savedCents={goal.savedCents}
            targetCents={goal.targetCents}
            minMonth={today.slice(0, 7)}
          />
        )}

        <section className="space-y-3 rounded-card border border-line bg-surface p-4">
          <div className="flex items-end justify-between">
            <p className="font-display text-4xl font-extrabold">{formatEUR(goal.savedCents)}</p>
            <p className="text-xs text-muted">
              de {formatEUR(goal.targetCents)} · {pct}%
            </p>
          </div>
          <ProgressBar label={`Progresso de ${goal.name}`} value={goal.savedCents} max={goal.targetCents} />
          <div className="flex justify-between text-xs">
            <span className={status.tone}>{status.text}</span>
            {goal.weeklyCents > 0 && <span className="text-muted">{formatEUR(goal.weeklyCents)}/semana</span>}
          </div>
        </section>

        <MoveMoney kind="goal" id={goal.id} canIn={!goal.complete} canOut={goal.savedCents > 0} />

        <section>
          <h2 className="mb-2 font-bold">Extrato</h2>
          <HistoryList days={history} today={today} empty="Nada foi guardado nesta meta ainda." />
        </section>
      </main>
    </div>
  );
}
