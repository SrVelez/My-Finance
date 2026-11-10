import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { checkGoalOpening, deadlinePassed, planGoal, suggestWeekly, weeksUntilDeadline, type ISODate } from "@/lib/engine";
import { formatEUR, type Cents } from "@/lib/money";
import { fail, ok, type ActionResult } from "@/lib/result";
import { todayISO } from "@/lib/today";
import { createdAtOf, toDbDate, toGoalState, weekStats } from "./state";
import { NotFoundError } from "@/lib/auth/errors";
import { active } from "./scope";
import { getUser } from "./user";

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

export async function listGoals(userId: string, today: ISODate): Promise<GoalsOverview> {
  const rows = await db.goal.findMany({ where: { userId, ...active }, orderBy: { priority: "asc" } });

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

/** A meta do usuário, ou `null` se não existe ou é de outra pessoa (a tela responde 404). */
export async function getGoal(userId: string, id: string) {
  return db.goal.findFirst({ where: { id, userId, ...active } });
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
    where: { userId, ...active, isEmergency: true, ...(keepId ? { id: { not: keepId } } : {}) },
    data: { isEmergency: false },
  });
}

/**
 * Cria a meta. Com `openingCents`, ela já nasce com esse saldo (guardado fora do app) e um
 * `opening_balance` registra a origem. Passar do alvo é permitido: a meta nasce concluída.
 */
export async function createGoalIn(
  tx: Prisma.TransactionClient,
  userId: string,
  input: GoalInput,
  openingCents: Cents,
  today: ISODate,
  { keepEmergencyFlags = false }: { keepEmergencyFlags?: boolean } = {},
) {
  const opening = checkGoalOpening(openingCents, input.targetCents);
  if (!opening.ok) throw new Error(opening.error);

  const last = await tx.goal.aggregate({ where: { userId }, _max: { priority: true } });
  const goal = await tx.goal.create({
    data: {
      userId,
      ...input,
      priority: (last._max.priority ?? 0) + 1,
      savedCents: opening.savedCents,
      createdAt: createdAtOf(today),
    },
  });
  if (opening.savedCents > 0) {
    await tx.transaction.create({
      data: {
        userId,
        type: "opening_balance",
        amountCents: opening.savedCents,
        date: toDbDate(today),
        goalId: goal.id,
        note: goal.name,
        balanceAfterCents: opening.savedCents,
      },
    });
  }
  // Só uma meta pode ser a reserva de emergência.
  if (input.isEmergency && !keepEmergencyFlags) {
    await tx.goal.updateMany({ where: { userId, isEmergency: true, id: { not: goal.id } }, data: { isEmergency: false } });
  }
}

export async function createGoalFor(userId: string, input: GoalInput, openingCents: Cents = 0, today: ISODate = todayISO()) {
  await db.$transaction((tx) => createGoalIn(tx, userId, input, openingCents, today));
}

export async function updateGoal(userId: string, id: string, input: GoalInput) {
  const { count } = await db.goal.updateMany({ where: { id, userId, ...active }, data: input });
  if (count === 0) throw new NotFoundError("Meta não encontrada.");
  if (input.isEmergency) await clearOtherEmergency(userId, id);
}

export async function deleteGoal(userId: string, id: string) {
  await db.$transaction(async (tx) => {
    const { count } = await tx.goal.deleteMany({ where: { id, userId, ...active } });
    if (count === 0) throw new NotFoundError("Meta não encontrada.");
    const rest = await tx.goal.findMany({ where: { userId, ...active }, orderBy: { priority: "asc" } });
    for (const [i, g] of rest.entries()) {
      if (g.priority !== i + 1) await tx.goal.updateMany({ where: { id: g.id, userId }, data: { priority: i + 1 } });
    }
  });
}

/** Nova ordem de prioridade; `ids` precisa conter exatamente as metas do usuário. */
export async function reorderGoals(userId: string, ids: string[]) {
  const rows = await db.goal.findMany({ where: { userId, ...active }, select: { id: true } });
  const known = new Set(rows.map((r) => r.id));
  if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
    throw new Error("Ordem inválida");
  }
  await db.$transaction(ids.map((id, i) => db.goal.updateMany({ where: { id, userId }, data: { priority: i + 1 } })));
}

/** Guardar (do livre da semana) ou retirar (de volta ao livre) um valor da meta. */
export async function moveGoalMoney(
  userId: string,
  id: string,
  direction: "in" | "out",
  cents: Cents,
  today: ISODate,
): Promise<ActionResult> {
  if (!Number.isInteger(cents) || cents <= 0) return fail("Informe um valor maior que zero.");
  const goal = await db.goal.findFirst({ where: { id, userId, ...active } });
  if (!goal) return fail("Meta não encontrada.");

  if (direction === "in") {
    const need = goal.targetCents - goal.savedCents;
    if (need <= 0) return fail("Esta meta já está completa.");
    if (cents > need) return fail(`Esta meta só precisa de mais ${formatEUR(need)}.`);
    const { weekStartDay } = await getUser(userId);
    const week = await weekStats(userId, today, weekStartDay);
    if (cents > week.freeLeftCents) {
      return fail(`Você só tem ${formatEUR(Math.max(week.freeLeftCents, 0))} livres esta semana.`);
    }
  } else if (cents > goal.savedCents) {
    return fail(`Há só ${formatEUR(goal.savedCents)} guardados nesta meta.`);
  }

  await db.$transaction([
    db.goal.updateMany({
      where: { id, userId },
      data: { savedCents: { increment: direction === "in" ? cents : -cents } },
    }),
    db.transaction.create({
      data: {
        userId,
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

export async function resolveGoalDeadline(userId: string, id: string, choice: DeadlineChoice, today: ISODate): Promise<ActionResult> {
  const goal = await getGoal(userId, id);
  if (!goal) return fail("Meta não encontrada.");

  switch (choice.type) {
    case "extend": {
      if (!/^d{4}-(0[1-9]|1[0-2])$/.test(choice.deadline) || deadlinePassed(choice.deadline, today)) {
        return fail("Escolha um mês que ainda não passou.");
      }
      await db.goal.updateMany({ where: { id, userId }, data: { deadline: choice.deadline, weeklyCents: 0 } });
      return ok();
    }
    case "target": {
      if (!Number.isInteger(choice.targetCents) || choice.targetCents <= 0) return fail("Informe um valor-alvo maior que zero.");
      // Se o novo alvo já foi alcançado, a meta fica completa; senão segue sem prazo até o novo alvo.
      await db.goal.updateMany({
        where: { id, userId },
        data: { targetCents: choice.targetCents, deadline: null, weeklyCents: goal.weeklyCents || suggestWeekly(choice.targetCents) },
      });
      return ok();
    }
    case "none": {
      await db.goal.updateMany({
        where: { id, userId },
        data: { deadline: null, weeklyCents: goal.weeklyCents || suggestWeekly(goal.targetCents) },
      });
      return ok();
    }
    case "complete": {
      if (goal.savedCents <= 0) return fail("Não há nada guardado; exclua a meta se não quiser mais.");
      await db.goal.updateMany({ where: { id, userId }, data: { targetCents: goal.savedCents, deadline: null } });
      return ok();
    }
  }
}
