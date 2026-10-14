import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatDayMonth, parseISO, weekdayShort } from "@/lib/engine";
import { formatEUR } from "@/lib/money";
import { StatementList } from "@/components/StatementList";
import { getHomeData } from "@/lib/services/home";
import { getStatement } from "@/lib/services/statement";
import { serverToday } from "@/lib/services/today";
import { getOrCreateUser } from "@/lib/services/user";

export default function Home() {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const user = await getOrCreateUser();
  // Quem ainda não fez o onboarding é levado a ele.
  if (!user.onboarded) redirect("/onboarding");

  const today = await serverToday();
  const [home, statement] = await Promise.all([getHomeData(today), getStatement(5)]);
  const hasIncome = home.poolCents > 0 || home.spentCents > 0;

  return (
    <main className="flex-1 space-y-6 px-5 pt-5 pb-6">
      <header>
        <p className="text-xs text-muted">{home.weekLabel}</p>
        <h1 className="text-sm font-bold">Olá{home.name ? `, ${home.name}` : ""}</h1>
      </header>

      <section className="rounded-card bg-brand p-5 text-white">
        <h2 className="text-sm">Livre para gastar esta semana</h2>
        <p className="mt-1 font-display text-6xl leading-none font-extrabold">{formatEUR(home.freeLeftCents)}</p>
        <p className="mt-3 text-xs">
          {hasIncome
            ? `de ${formatEUR(home.poolCents)} · você já gastou ${formatEUR(home.spentCents)}`
            : "Toque em Recebi para ver quanto separar."}
        </p>
        <div className="mt-3">
          <ProgressBar tone="onBrand" label="Livre já gasto" value={home.spentCents} max={home.poolCents} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link href="/receber" className="flex min-h-12 items-center justify-center rounded-xl bg-white text-sm font-bold text-brand">
            + Recebi
          </Link>
          <Link href="/gastar" className="flex min-h-12 items-center justify-center rounded-xl bg-white/15 text-sm font-bold">
            − Gastei
          </Link>
        </div>
      </section>

      <section>
        <SectionHeader title="Extrato" href="/extrato" linkLabel="Ver tudo" />
        <StatementList entries={statement} today={today} />
      </section>

      <section>
        <SectionHeader title="Próximos vencimentos" href="/contas" />
        {home.upcoming.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma conta fixa ainda.</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {home.upcoming.slice(0, 3).map((b) => (
              <li key={b.id} className="flex items-center gap-4 px-4 py-3">
                <span className="w-9 text-center leading-tight">
                  <span className="block text-base font-extrabold">{parseISO(b.due).d}</span>
                  <span className="block text-[10px] font-semibold text-muted">{weekdayShort(b.due)}</span>
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{b.name}</span>
                  <span className="block text-xs text-muted">{formatDayMonth(b.due)}</span>
                </span>
                <span className="text-right">
                  <span className="block font-extrabold">{formatEUR(b.amountCents)}</span>
                  <span className={`block text-xs ${b.covered ? "font-semibold text-brand" : "text-muted"}`}>
                    {b.covered ? "Coberto" : `${formatEUR(b.savedCents)} guardados`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeader title="Metas" href="/metas" />
        {home.goals.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma meta ainda.</p>
        ) : (
          <ul className="space-y-3 rounded-card border border-line bg-surface p-4">
            {home.goals.slice(0, 2).map((g) => (
              <li key={g.id} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">{g.name}</span>
                  <span className="text-muted">
                    {formatEUR(g.savedCents)} / {formatEUR(g.targetCents)}
                  </span>
                </div>
                <ProgressBar label={`Progresso de ${g.name}`} value={g.savedCents} max={g.targetCents} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function SectionHeader({ title, href, linkLabel = "Ver todas" }: { title: string; href: string; linkLabel?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="font-bold">{title}</h2>
      <Link href={href} className="flex min-h-11 items-center text-xs font-semibold text-brand">
        {linkLabel}
      </Link>
    </div>
  );
}
