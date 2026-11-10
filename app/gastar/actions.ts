"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Category } from "@/lib/categories";
import { registerExpense } from "@/lib/services/expense";
import { requireUser } from "@/lib/auth/session";
import { assertCents, assertISODate } from "@/lib/validate";

export async function registerExpenseAction(amountCents: number, category: Category, date: string) {
  const { userId } = await requireUser();
  await registerExpense(userId, assertCents(amountCents, { min: 1 }), category, assertISODate(date));
  revalidatePath("/");
  redirect("/");
}
