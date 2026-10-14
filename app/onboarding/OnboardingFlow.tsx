"use client";

import { useState } from "react";
import type { OnboardingDraft } from "@/lib/draft";
import { StepBills } from "./StepBills";
import { StepGoals } from "./StepGoals";
import { StepPriorities } from "./StepPriorities";
import { StepPreview } from "./StepPreview";

export type Step = 1 | 2 | 3 | 4;

export interface StepProps {
  draft: OnboardingDraft;
  update: (fn: (d: OnboardingDraft) => OnboardingDraft) => void;
  go: (step: Step) => void;
}

export function OnboardingFlow() {
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<OnboardingDraft>({ weeklyLivingCents: 0, bills: [], goals: [] });

  const props: StepProps = { draft, update: (fn) => setDraft(fn), go: setStep };

  if (step === 1) return <StepBills {...props} />;
  if (step === 2) return <StepGoals {...props} />;
  if (step === 3) return <StepPriorities {...props} />;
  return <StepPreview {...props} />;
}
