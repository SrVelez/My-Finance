"use server";

import { redirect } from "next/navigation";
import { sanitizeDraft } from "@/lib/draft";
import { completeOnboarding } from "@/lib/services/onboarding";

export async function finishOnboarding(draft: unknown) {
  await completeOnboarding(sanitizeDraft(draft));
  redirect("/");
}
