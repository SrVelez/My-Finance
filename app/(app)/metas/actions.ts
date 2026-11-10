"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createGoalFor,
  deleteGoal,
  reorderGoals,
  resolveGoalDeadline,
  updateGoal,
  type DeadlineChoice,
  type GoalInput,
} from "@/lib/services/goals";
import { fail, type ActionResult } from "@/lib/result";
import { requireUser } from "@/lib/auth/session";
import { serverToday } from "@/lib/services/today";
import { assertCents, assertDeadline, assertName } from "@/lib/validate";

function parse(input: GoalInput): GoalInput {
  return {
    name: assertName(input.name),
    targetCents: assertCents(input.targetCents, { min: 1 }),
    deadline: assertDeadline(input.deadline),
    weeklyCents: assertCents(input.weeklyCents),
    isEmergency: input.isEmergency === true,
  };
}

const refresh = () => {
  revalidatePath("/metas");
  revalidatePath("/");
};

export async function createGoalAction(input: GoalInput, openingCents = 0) {
  const { userId } = await requireUser();
  await createGoalFor(userId, parse(input), assertCents(openingCents), await serverToday());
  refresh();
  redirect("/metas");
}

export async function updateGoalAction(id: string, input: GoalInput) {
  const { userId } = await requireUser();
  await updateGoal(userId, id, parse(input));
  refresh();
  redirect(`/metas/${id}`);
}

export async function deleteGoalAction(id: string) {
  const { userId } = await requireUser();
  await deleteGoal(userId, id);
  refresh();
  redirect("/metas");
}

export async function reorderGoalsAction(ids: string[]) {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) throw new Error("Ordem inválida");
  const { userId } = await requireUser();
  await reorderGoals(userId, ids);
  refresh();
}

/** Meta com prazo vencido: estender, ajustar o alvo, seguir sem prazo ou concluir. */
export async function resolveGoalDeadlineAction(id: string, choice: DeadlineChoice): Promise<ActionResult> {
  const { userId } = await requireUser();
  try {
    const result = await resolveGoalDeadline(userId, id, choice, await serverToday());
    if (result.ok) refresh();
    return result;
  } catch {
    return fail("Não foi possível salvar. Tente de novo.");
  }
}
