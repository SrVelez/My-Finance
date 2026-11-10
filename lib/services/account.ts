import { db } from "@/lib/db";
import { fail, ok, type ActionResult } from "@/lib/result";
import { getUser } from "./user";

/**
 * Tudo o que o Finança guarda de UMA pessoa (cópia em JSON, exigência do GDPR): configurações,
 * contas fixas e metas (inclusive as arquivadas), todas as transações (recebimentos, gastos,
 * alocações, saldos iniciais e ajustes) e as formas de entrar. Nunca inclui segredos de login
 * (sessões, tokens, chaves de passkey) nem dados de outra pessoa.
 */
export async function exportUserData(userId: string) {
  const user = await getUser(userId);
  const [bills, goals, transactions, accounts, passkeys] = await Promise.all([
    db.bill.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    db.goal.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    db.transaction.findMany({ where: { userId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    db.account.findMany({ where: { userId }, select: { providerId: true, createdAt: true } }),
    db.passkey.findMany({ where: { userId }, select: { name: true, deviceType: true, createdAt: true } }),
  ]);

  return {
    format: "financa-export-v1",
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      weeklyLivingCents: user.weeklyLivingCents,
      weekStartDay: user.weekStartDay,
      onboarded: user.onboarded,
      createdAt: user.createdAt,
    },
    bills,
    goals,
    transactions,
    signInMethods: { providers: accounts, passkeys },
  };
}

/**
 * Apaga a conta e TUDO dela (contas, metas, transações, ajustes, sessões, passkeys, contas
 * conectadas, claims do onboarding), por `onDelete: Cascade`, mais os registros de código por
 * e-mail. Exige digitar o e-mail da conta. Os dados de outras pessoas não são tocados.
 */
export async function deleteAccountFor(userId: string, typedEmail: string): Promise<ActionResult> {
  const user = await getUser(userId);
  if (typedEmail.trim().toLowerCase() !== user.email.toLowerCase()) return fail("O e-mail digitado não confere.");
  await db.$transaction([
    db.otpSend.deleteMany({ where: { email: user.email } }),
    db.verification.deleteMany({ where: { identifier: { contains: user.email } } }),
    db.user.delete({ where: { id: userId } }),
  ]);
  return ok();
}
