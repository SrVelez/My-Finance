"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createGoal,
  deleteGoal,
  reorderGoals,
  resolveGoalDeadline,
  updateGoal,
  type DeadlineChoice,
  type GoalInput,
} from "@/lib/services/goals";
import { fail, type ActionResult } from "@/lib/result";
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

export async function createGoalAction(input: GoalInput) {
  await createGoal(parse(input));
  refresh();
  redirect("/metas");
}

export async function updateGoalAction(id: string, input: GoalInput) {
  await updateGoal(id, parse(input));
  refresh();
  redirect(`/metas/${id}`);
}

export async function deleteGoalAction(id: string) {
  await deleteGoal(id);
  refresh();
  redirect("/metas");
}

export async function reorderGoalsAction(ids: string[]) {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) throw new Error("Ordem inválida");
  await reorderGoals(ids);
  refresh();
}

/** Meta com prazo vencido: estender, ajustar o alvo, seguir sem prazo ou concluir. */
export async function resolveGoalDeadlineAction(id: string, choice: DeadlineChoice): Promise<ActionResult> {
  try {
    const result = await resolveGoalDeadline(id, choice, await serverToday());
    if (result.ok) refresh();
    return result;
  } catch {
    return fail("Não foi possível salvar. Tente de novo.");
  }
}
