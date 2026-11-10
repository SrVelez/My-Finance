import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/auth/errors";

/** Dados e configurações do usuário (nome, gasto semanal, início da semana, onboarding feito). */
export async function getUser(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("Usuário não encontrado.");
  return user;
}
