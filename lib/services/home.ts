import { formatWeekLabel, type ISODate } from "@/lib/engine";
import type { Cents } from "@/lib/money";
import { listBills, type BillView, type OpenDue } from "./bills";
import { loadState, weekStats } from "./state";

export interface HomeData {
  name: string;
  weekLabel: string;
  poolCents: Cents;
  spentCents: Cents;
  freeLeftCents: Cents;
  /** Vencimentos que esperam resposta: "Você pagou?" ou em atraso. */
  attention: { id: string; name: string; open: OpenDue }[];
  upcoming: Pick<BillView, "id" | "name" | "due" | "amountCents" | "savedCents" | "covered" | "daysLeft" | "receiptsLeft" | "targetCents">[];
  goals: { id: string; name: string; savedCents: Cents; targetCents: Cents }[];
}

export async function getHomeData(today: ISODate): Promise<HomeData> {
  const { user, state } = await loadState();
  const [week, bills] = await Promise.all([weekStats(user.id, today, user.weekStartDay), listBills(today)]);

  return {
    name: user.name,
    weekLabel: formatWeekLabel(week.start, week.end),
    poolCents: week.poolCents,
    spentCents: week.spentCents,
    freeLeftCents: week.freeLeftCents,
    attention: bills.upcoming.filter((b) => b.open).map((b) => ({ id: b.id, name: b.name, open: b.open! })),
    // Em atraso já aparece em "atenção"; aqui ficam só os próximos vencimentos.
    upcoming: bills.upcoming.filter((b) => b.open?.kind !== "overdue"),
    goals: state.goals.map((g) => ({
      id: g.id,
      name: g.name,
      savedCents: g.savedCents,
      targetCents: g.targetCents,
    })),
  };
}
