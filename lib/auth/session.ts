import { connection } from "next/server";
import { db } from "@/lib/db";
import { LEGACY_EMAIL } from "./legacy";

/** Quem está logado. O `userId` vem SEMPRE daqui (sessão no servidor), nunca do cliente. */
export interface SessionUser {
  userId: string;
}

/**
 * TEMPORÁRIO (Fase 1): resolve o usuário local único, como o app fazia antes do login, para o
 * app continuar funcionando enquanto o Better Auth não está ligado. A Fase 2 troca o corpo
 * desta função pela sessão real.
 */
export async function requireUser(): Promise<SessionUser> {
  await connection();
  const existing = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  const user = existing ?? (await db.user.create({ data: { name: "", email: LEGACY_EMAIL } }));
  return { userId: user.id };
}
