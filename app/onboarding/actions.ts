"use server";

import { redirect } from "next/navigation";
import { sanitizeDraft } from "@/lib/draft";
import { requireUser } from "@/lib/auth/session";
import { completeOnboardingFor } from "@/lib/services/onboarding";
import { serverToday } from "@/lib/services/today";

export async function finishOnboarding(draft: unknown) {
  const { userId } = await requireUser();
  await completeOnboardingFor(userId, sanitizeDraft(draft), await serverToday());
  redirect("/");
}
