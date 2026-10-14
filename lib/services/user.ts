import { connection } from "next/server";
import { db } from "@/lib/db";

/** MVP sem autenticação: um único usuário local (criado sob demanda). */
export async function getOrCreateUser() {
  await connection();
  const existing = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return db.user.create({ data: { name: "", weeklyLivingCents: 0 } });
}
