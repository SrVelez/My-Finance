import { db } from "@/lib/db";
import { deadlinePassed, planGoal, suggestWeekly, weeksUntilDeadline, type ISODate } from "@/lib/engine";
import { formatEUR, type Cents } from "@/lib/money";
import { fail, ok, type ActionResult } from "@/lib/result";
import { toDbDate, toGoalState, weekStats } from "./state";
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
  /** Semanas até o prazo (só metas com prazo ainda aberto). */
  deadlineWeeks: number | null;
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
      pastDeadline: !!row.deadline && falta > 0 && deadlinePassed(row.deadline, today),
      deadlineWeeks:
        row.deadline && falta > 0 && !deadlinePassed(row.deadline, today) ? weeksUntilDeadline(today, row.deadline) : null,
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

/** Guardar (do livre da semana) ou retirar (de volta ao livre) um valor da meta. */
export async function moveGoalMoney(
  id: string,
  direction: "in" | "out",
  cents: Cents,
  today: ISODate,
): Promise<ActionResult> {
  if (!Number.isInteger(cents) || cents <= 0) return fail("Informe um valor maior que zero.");
  const user = await getOrCreateUser();
  const goal = await db.goal.findFirst({ where: { id, userId: user.id } });
  if (!goal) return fail("Meta não encontrada.");

  if (direction === "in") {
    const need = goal.targetCents - goal.savedCents;
    if (need <= 0) return fail("Esta meta já está completa.");
    if (cents > need) return fail(`Esta meta só precisa de mais ${formatEUR(need)}.`);
    const week = await weekStats(user.id, today, user.weekStartDay);
    if (cents > week.freeLeftCents) {
      return fail(`Você só tem ${formatEUR(Math.max(week.freeLeftCents, 0))} livres esta semana.`);
    }
  } else if (cents > goal.savedCents) {
    return fail(`Há só ${formatEUR(goal.savedCents)} guardados nesta meta.`);
  }

  await db.$transaction([
    db.goal.update({
      where: { id },
      data: { savedCents: { increment: direction === "in" ? cents : -cents } },
    }),
    db.transaction.create({
      data: {
        userId: user.id,
        type: direction === "in" ? "allocation" : "withdrawal",
        amountCents: cents,
        date: toDbDate(today),
        goalId: id,
        note: goal.name,
        category: "manual",
      },
    }),
  ]);
  return ok();
}

/** O que fazer com uma meta cujo prazo venceu sem completar. */
export type DeadlineChoice =
  | { type: "extend"; deadline: string }
  | { type: "target"; targetCents: Cents }
  | { type: "none" }
  | { type: "complete" };

export async function resolveGoalDeadline(id: string, choice: DeadlineChoice, today: ISODate): Promise<ActionResult> {
  const goal = await getGoal(id);
  if (!goal) return fail("Meta não encontrada.");

  switch (choice.type) {
    case "extend": {
      if (!/^d{4}-(0[1-9]|1[0-2])$/.test(choice.deadline) || deadlinePassed(choice.deadline, today)) {
        return fail("Escolha um mês que ainda não passou.");
      }
      await db.goal.update({ where: { id }, data: { deadline: choice.deadline, weeklyCents: 0 } });
      return ok();
    }
    case "target": {
      if (!Number.isInteger(choice.targetCents) || choice.targetCents <= 0) return fail("Informe um valor-alvo maior que zero.");
      // Se o novo alvo já foi alcançado, a meta fica completa; senão segue sem prazo até o novo alvo.
      await db.goal.update({
        where: { id },
        data: { targetCents: choice.targetCents, deadline: null, weeklyCents: goal.weeklyCents || suggestWeekly(choice.targetCents) },
      });
      return ok();
    }
    case "none": {
      await db.goal.update({
        where: { id },
        data: { deadline: null, weeklyCents: goal.weeklyCents || suggestWeekly(goal.targetCents) },
      });
      return ok();
    }
    case "complete": {
      if (goal.savedCents <= 0) return fail("Não há nada guardado; exclua a meta se não quiser mais.");
      await db.goal.update({ where: { id }, data: { targetCents: goal.savedCents, deadline: null } });
      return ok();
    }
  }
}
