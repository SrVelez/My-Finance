"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { requireUser } from "@/lib/auth/session";
import { fail, type ActionResult } from "@/lib/result";
import { deleteAccountFor } from "@/lib/services/account";
import { resetAllData, updateSettings, type SettingsInput } from "@/lib/services/settings";
import { getUser } from "@/lib/services/user";
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

/**
 * Apaga a conta e tudo dela. Exige digitar o e-mail da conta. Encerra a sessão deste aparelho
 * (as outras morrem junto, por cascade) e volta para as Boas-vindas.
 */
export async function deleteAccountAction(typedEmail: string): Promise<ActionResult> {
  const { userId } = await requireUser();
  const user = await getUser(userId);
  if (String(typedEmail ?? "").trim().toLowerCase() !== user.email.toLowerCase()) return fail("O e-mail digitado não confere.");
  // Primeiro limpa o cookie deste aparelho; depois apaga (a sessão some junto com a conta).
  await auth.api.signOut({ headers: await headers() }).catch(() => null);
  const result = await deleteAccountFor(userId, typedEmail);
  if (!result.ok) return result;
  redirect("/");
}
