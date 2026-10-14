import { db } from "@/lib/db";
import type { OnboardingDraft } from "@/lib/draft";
import { getOrCreateUser } from "./user";

/** Grava o resultado do onboarding; substitui contas, metas e transações do usuário. */
export async function completeOnboarding(draft: OnboardingDraft) {
  const user = await getOrCreateUser();
  await db.$transaction([
    db.transaction.deleteMany({ where: { userId: user.id } }),
    db.bill.deleteMany({ where: { userId: user.id } }),
    db.goal.deleteMany({ where: { userId: user.id } }),
    db.user.update({
      where: { id: user.id },
      data: { weeklyLivingCents: draft.weeklyLivingCents, onboarded: true },
    }),
    ...draft.bills.map((b) =>
      db.bill.create({
        data: { userId: user.id, name: b.name, amountCents: b.amountCents, dueDay: b.dueDay },
      }),
    ),
    ...draft.goals.map((g, i) =>
      db.goal.create({
        data: {
          userId: user.id,
          name: g.name,
          targetCents: g.targetCents,
          deadline: g.deadline,
          weeklyCents: g.deadline ? 0 : (g.weeklyCents ?? 0),
          priority: i + 1,
          isEmergency: g.isEmergency,
        },
      }),
    ),
  ]);
}
