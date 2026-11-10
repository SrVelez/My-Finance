"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resetAllData, updateSettings, type SettingsInput } from "@/lib/services/settings";
import { requireUser } from "@/lib/auth/session";
import { assertCents } from "@/lib/validate";

export async function saveSettingsAction(input: SettingsInput) {
  const day = input.weekStartDay;
  if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error("Dia inválido");
  const { userId } = await requireUser();
  await updateSettings(userId, {
    name: String(input.name ?? "").trim().slice(0, 40),
    weeklyLivingCents: assertCents(input.weeklyLivingCents),
    weekStartDay: day,
  });
  revalidatePath("/", "layout");
}

export async function resetAllDataAction() {
  const { userId } = await requireUser();
  await resetAllData(userId);
  revalidatePath("/", "layout");
  redirect("/onboarding");
}
