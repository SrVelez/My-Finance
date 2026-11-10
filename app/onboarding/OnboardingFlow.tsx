"use client";

import { useMemo, useState } from "react";
import type { OnboardingDraft } from "@/lib/draft";
import { newDraftId, parseStored, useStoredDraftRaw, writeStored } from "@/lib/draftStorage";
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

const EMPTY: OnboardingDraft = { weeklyLivingCents: 0, bills: [], goals: [] };

/**
 * Onboarding sem login: o rascunho é guardado no aparelho (com um `draftId`) e só vira dados da
 * conta depois do login, em "Salve seu plano".
 */
export function OnboardingFlow() {
  const [step, setStep] = useState<Step>(1);
  const raw = useStoredDraftRaw();
  const stored = useMemo(() => parseStored(raw), [raw]);
  const current = stored ?? { draftId: "", draft: EMPTY };

  const update: StepProps["update"] = (fn) => {
    writeStored({ draftId: current.draftId || newDraftId(), draft: fn(current.draft) });
  };

  const props: StepProps = { draft: current.draft, update, go: setStep };

  if (step === 1) return <StepBills {...props} />;
  if (step === 2) return <StepGoals {...props} />;
  if (step === 3) return <StepPriorities {...props} />;
  return <StepPreview {...props} />;
}
