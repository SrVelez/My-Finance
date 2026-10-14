import { formatWeekLabel, nextDue, settleBill, type ISODate } from "@/lib/engine";
import type { Cents } from "@/lib/money";
import { loadState, weekStats } from "./state";

export interface HomeData {
  name: string;
  weekLabel: string;
  poolCents: Cents;
  spentCents: Cents;
  freeLeftCents: Cents;
  upcoming: { id: string; name: string; due: ISODate; amountCents: Cents; savedCents: Cents; covered: boolean }[];
  goals: { id: string; name: string; savedCents: Cents; targetCents: Cents }[];
}

export async function getHomeData(today: ISODate): Promise<HomeData> {
  const { user, state } = await loadState();
  const week = await weekStats(user.id, today, user.weekStartDay);

  const upcoming = state.bills
    .map((b) => {
      const settled = settleBill(b, today);
      return {
        id: b.id,
        name: b.name,
        due: nextDue(settled, today),
        amountCents: b.amountCents,
        savedCents: settled.savedCents,
        covered: settled.savedCents >= b.amountCents,
      };
    })
    .sort((a, b) => a.due.localeCompare(b.due));

  return {
    name: user.name,
    weekLabel: formatWeekLabel(week.start, week.end),
    poolCents: week.poolCents,
    spentCents: week.spentCents,
    freeLeftCents: week.freeLeftCents,
    upcoming,
    goals: state.goals.map((g) => ({
      id: g.id,
      name: g.name,
      savedCents: g.savedCents,
      targetCents: g.targetCents,
    })),
  };
}
