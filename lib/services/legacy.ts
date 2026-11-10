import { db } from "@/lib/db";
import { LEGACY_EMAIL } from "@/lib/auth/legacy";

/**
 * Prepara um banco criado ANTES do login para o schema novo (User.email obrigatório e único):
 * o usuário existente (o único local) vira o usuário "legado", com um e-mail provisório.
 * Idempotente. Rode antes do `prisma db push` (veja `npm run db:prepare-login`).
 */
export async function prepareLegacyUser(): Promise<number> {
  const cols = (await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("User")`)).map((c) => c.name);
  if (cols.length === 0) return 0; // banco novo
  if (!cols.includes("email")) await db.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "email" TEXT`);
  const rows = await db.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "User" WHERE email IS NULL ORDER BY createdAt ASC`);
  for (const [i, r] of rows.entries()) {
    // Só o primeiro usuário fica como legado; qualquer outro ganha um e-mail próprio.
    await db.$executeRawUnsafe(`UPDATE "User" SET email = ? WHERE id = ?`, i === 0 ? LEGACY_EMAIL : `legado-${r.id}@financa.local`, r.id);
  }
  return rows.length;
}

export type ClaimLegacyResult =
  | { ok: true; bills: number; goals: number; transactions: number }
  | { ok: false; error: string };

/**
 * Transfere os dados do usuário legado (de antes do login) para a conta com este e-mail e apaga o
 * usuário legado. A conta precisa existir (entre uma vez pelo app antes) e estar vazia: o comando
 * nunca mistura nem sobrescreve dados de uma conta que já tem plano.
 */
export async function claimLegacyData(email: string): Promise<ClaimLegacyResult> {
  const target = email.trim().toLowerCase();
  if (target === LEGACY_EMAIL) return { ok: false, error: "Informe o e-mail da sua conta, não o do usuário legado." };

  return db.$transaction(async (tx): Promise<ClaimLegacyResult> => {
    const legacy = await tx.user.findUnique({ where: { email: LEGACY_EMAIL } });
    if (!legacy) return { ok: false, error: "Não há dados legados para transferir." };
    const account = await tx.user.findUnique({ where: { email: target } });
    if (!account) return { ok: false, error: `Nenhuma conta com o e-mail ${target}. Entre pelo app uma vez e rode de novo.` };

    const [bills, goals, transactions] = await Promise.all([
      tx.bill.count({ where: { userId: account.id } }),
      tx.goal.count({ where: { userId: account.id } }),
      tx.transaction.count({ where: { userId: account.id } }),
    ]);
    if (account.onboarded || bills + goals + transactions > 0) {
      return { ok: false, error: "Essa conta já tem um plano salvo. Para não misturar dados, nada foi transferido." };
    }

    const moved = {
      bills: (await tx.bill.updateMany({ where: { userId: legacy.id }, data: { userId: account.id } })).count,
      goals: (await tx.goal.updateMany({ where: { userId: legacy.id }, data: { userId: account.id } })).count,
      transactions: (await tx.transaction.updateMany({ where: { userId: legacy.id }, data: { userId: account.id } })).count,
    };
    await tx.user.update({
      where: { id: account.id },
      data: {
        name: account.name || legacy.name,
        weeklyLivingCents: legacy.weeklyLivingCents,
        weekStartDay: legacy.weekStartDay,
        onboarded: legacy.onboarded,
      },
    });
    await tx.user.delete({ where: { id: legacy.id } });
    return { ok: true, ...moved };
  });
}
