"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resetAllData, updateSettings, type SettingsInput } from "@/lib/services/settings";
import { assertCents } from "@/lib/validate";

export async function saveSettingsAction(input: SettingsInput) {
  const day = input.weekStartDay;
  if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error("Dia inválido");
  await updateSettings({
    name: String(input.name ?? "").trim().slice(0, 40),
    weeklyLivingCents: assertCents(input.weeklyLivingCents),
    weekStartDay: day,
  });
  revalidatePath("/", "layout");
}

export async function resetAllDataAction() {
  await resetAllData();
  revalidatePath("/", "layout");
  redirect("/onboarding");
}
