import { db } from "@/lib/db";
import { CATEGORIES, type Category } from "@/lib/categories";
import type { ISODate } from "@/lib/engine";
import type { Cents } from "@/lib/money";
import { toDbDate } from "./state";
import { getOrCreateUser } from "./user";

/** "Gastei": registra a despesa; reduz o livre da semana. */
export async function registerExpense(amountCents: Cents, category: Category, date: ISODate) {
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_000) {
    throw new Error("Valor inválido");
  }
  if (!CATEGORIES.includes(category)) throw new Error("Categoria inválida");
  const user = await getOrCreateUser();
  await db.transaction.create({
    data: { userId: user.id, type: "expense", amountCents, category, date: toDbDate(date) },
  });
}
