"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { confirmIncome, simulateIncome } from "@/lib/services/income";
import { requireUser } from "@/lib/auth/session";
import { assertCents, assertISODate } from "@/lib/validate";

export async function simulateIncomeAction(incomeCents: number, date: string) {
  const { userId } = await requireUser();
  return simulateIncome(userId, assertCents(incomeCents, { min: 1 }), assertISODate(date));
}

export async function confirmIncomeAction(input: {
  incomeCents: number;
  date: string;
  overrides?: Record<string, number>;
  useReserve?: boolean;
}) {
  const { userId } = await requireUser();
  await confirmIncome(userId, {
    incomeCents: assertCents(input.incomeCents, { min: 1 }),
    date: assertISODate(input.date),
    overrides: input.overrides,
    useReserve: input.useReserve === true,
  });
  revalidatePath("/");
  redirect("/");
}
