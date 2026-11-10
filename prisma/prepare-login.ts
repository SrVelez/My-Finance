import { db } from "../lib/db";
import { prepareLegacyUser } from "../lib/services/legacy";

/**
 * Prepara um banco criado ANTES do login para o schema novo (User.email obrigatório e único).
 * Rode ANTES do `prisma db push`: `npm run db:prepare-login`. Idempotente.
 */
prepareLegacyUser()
  .then((n) => console.log(n === 0 ? "Nada a preparar." : `Usuário(s) preparado(s): ${n}.`))
  .finally(() => db.$disconnect());
