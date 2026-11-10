import { db } from "@/lib/db";
import type { Cents } from "@/lib/money";

export interface SettingsInput {
  name: string;
  weeklyLivingCents: Cents;
  /** 0 = domingo … 6 = sábado. */
  weekStartDay: number;
}

export async function updateSettings(userId: string, input: SettingsInput) {
  await db.user.update({ where: { id: userId }, data: input });
}

/** Apaga contas, metas e transações e volta ao onboarding. */
export async function resetAllData(userId: string) {
  await db.$transaction([
    db.transaction.deleteMany({ where: { userId } }),
    db.bill.deleteMany({ where: { userId } }),
    db.goal.deleteMany({ where: { userId } }),
    db.user.update({
      where: { id: userId },
      data: { name: "", weeklyLivingCents: 0, weekStartDay: 1, onboarded: false },
    }),
  ]);
}
