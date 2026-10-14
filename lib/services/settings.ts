import { db } from "@/lib/db";
import type { Cents } from "@/lib/money";
import { getOrCreateUser } from "./user";

export interface SettingsInput {
  name: string;
  weeklyLivingCents: Cents;
  /** 0 = domingo … 6 = sábado. */
  weekStartDay: number;
}

export async function updateSettings(input: SettingsInput) {
  const user = await getOrCreateUser();
  await db.user.update({ where: { id: user.id }, data: input });
}

/** Apaga contas, metas e transações e volta ao onboarding. */
export async function resetAllData() {
  const user = await getOrCreateUser();
  await db.$transaction([
    db.transaction.deleteMany({ where: { userId: user.id } }),
    db.bill.deleteMany({ where: { userId: user.id } }),
    db.goal.deleteMany({ where: { userId: user.id } }),
    db.user.update({
      where: { id: user.id },
      data: { name: "", weeklyLivingCents: 0, weekStartDay: 1, onboarded: false },
    }),
  ]);
}
