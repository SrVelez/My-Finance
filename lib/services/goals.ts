import { db } from "@/lib/db";
import { planGoal, type ISODate } from "@/lib/engine";
import type { Cents } from "@/lib/money";
import { toGoalState } from "./state";
import { getOrCreateUser } from "./user";

export interface GoalView {
  id: string;
  name: string;
  priority: number;
  targetCents: Cents;
  savedCents: Cents;
  deadline: string | null;
  /** Valor semanal planejado (calculado se há prazo). */
  weeklyCents: Cents;
  complete: boolean;
  /** Semanas até completar no ritmo atual (só metas sem prazo). */
  weeksLeft: number | null;
  /** Prazo (yyyy-mm) já passou sem completar. */
  pastDeadline: boolean;
}

export interface GoalsOverview {
  savedCents: Cents;
  weeklyCents: Cents;
  goals: GoalView[];
}

export async function listGoals(today: ISODate): Promise<GoalsOverview> {
  const user = await getOrCreateUser();
  const rows = await db.goal.findMany({ where: { userId: user.id }, orderBy: { priority: "asc" } });

  const goals = rows.map((row): GoalView => {
    const goal = toGoalState(row);
    const plan = planGoal(goal, today);
    const falta = Math.max(0, goal.targetCents - goal.savedCents);
    return {
      id: row.id,
      name: row.name,
      priority: row.priority,
      targetCents: row.targetCents,
      savedCents: row.savedCents,
      deadline: row.deadline,
      weeklyCents: plan.amountCents,
      complete: falta === 0,
      weeksLeft: !row.deadline && falta > 0 && row.weeklyCents > 0 ? Math.ceil(falta / row.weeklyCents) : null,
      pastDeadline: !!row.deadline && falta > 0 && `${row.deadline}-28` < today,
    };
  });

  return {
    savedCents: goals.reduce((s, g) => s + g.savedCents, 0),
    weeklyCents: goals.reduce((s, g) => s + g.weeklyCents, 0),
    goals,
  };
}

export async function getGoal(id: string) {
  const user = await getOrCreateUser();
  return db.goal.findFirst({ where: { id, userId: user.id } });
}

export interface GoalInput {
  name: string;
  targetCents: Cents;
  deadline: string | null;
  weeklyCents: Cents;
  isEmergency: boolean;
}

/** Só uma meta pode ser a reserva de emergência. */
async function clearOtherEmergency(userId: string, keepId: string | null) {
  await db.goal.updateMany({
    where: { userId, isEmergency: true, ...(keepId ? { id: { not: keepId } } : {}) },
    data: { isEmergency: false },
  });
}

export async function createGoal(input: GoalInput) {
  const user = await getOrCreateUser();
  const last = await db.goal.aggregate({ where: { userId: user.id }, _max: { priority: true } });
  const goal = await db.goal.create({
    data: { userId: user.id, ...input, priority: (last._max.priority ?? 0) + 1 },
  });
  if (input.isEmergency) await clearOtherEmergency(user.id, goal.id);
}

export async function updateGoal(id: string, input: GoalInput) {
  const goal = await getGoal(id);
  if (!goal) throw new Error("Meta não encontrada");
  await db.goal.update({ where: { id }, data: input });
  if (input.isEmergency) await clearOtherEmergency(goal.userId, id);
}

export async function deleteGoal(id: string) {
  const goal = await getGoal(id);
  if (!goal) throw new Error("Meta não encontrada");
  await db.$transaction(async (tx) => {
    await tx.goal.delete({ where: { id } });
    const rest = await tx.goal.findMany({ where: { userId: goal.userId }, orderBy: { priority: "asc" } });
    for (const [i, g] of rest.entries()) {
      if (g.priority !== i + 1) await tx.goal.update({ where: { id: g.id }, data: { priority: i + 1 } });
    }
  });
}

/** Nova ordem de prioridade; `ids` precisa conter exatamente as metas do usuário. */
export async function reorderGoals(ids: string[]) {
  const user = await getOrCreateUser();
  const rows = await db.goal.findMany({ where: { userId: user.id }, select: { id: true } });
  const known = new Set(rows.map((r) => r.id));
  if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
    throw new Error("Ordem inválida");
  }
  await db.$transaction(ids.map((id, i) => db.goal.update({ where: { id }, data: { priority: i + 1 } })));
}
