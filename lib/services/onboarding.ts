import { db } from "@/lib/db";
import type { OnboardingDraft } from "@/lib/draft";
import type { ISODate } from "@/lib/engine";
import { todayISO } from "@/lib/today";
import { createBillIn } from "./bills";
import { createGoalIn } from "./goals";

/**
 * Grava o resultado do onboarding; substitui contas, metas e transações do usuário.
 * Contas, metas e saldos iniciais entram juntos, numa única transação: se algo for inválido, nada é gravado.
 */
export async function completeOnboardingFor(userId: string, draft: OnboardingDraft, today: ISODate = todayISO()) {
  await db.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { userId } });
    await tx.bill.deleteMany({ where: { userId } });
    await tx.goal.deleteMany({ where: { userId } });
    await tx.user.update({ where: { id: userId }, data: { weeklyLivingCents: draft.weeklyLivingCents, onboarded: true } });

    for (const b of draft.bills) {
      await createBillIn(tx, userId, { name: b.name, amountCents: b.amountCents, dueDay: b.dueDay }, b.opening ?? { mode: "none" }, today);
    }
    for (const g of draft.goals) {
      await createGoalIn(
        tx,
        userId,
        { name: g.name, targetCents: g.targetCents, deadline: g.deadline, weeklyCents: g.deadline ? 0 : (g.weeklyCents ?? 0), isEmergency: g.isEmergency },
        g.openingCents ?? 0,
        today,
        // O onboarding grava as metas como o usuário marcou, sem escolher uma única reserva.
        { keepEmergencyFlags: true },
      );
    }
  });
}
