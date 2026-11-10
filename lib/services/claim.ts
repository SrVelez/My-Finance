import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { OnboardingDraft } from "@/lib/draft";
import { checkBillOpening, checkGoalOpening, type ISODate } from "@/lib/engine";
import { todayISO } from "@/lib/today";
import { resetAllIn } from "./balance";
import { createBillIn } from "./bills";
import { createGoalIn } from "./goals";
import { active } from "./scope";

export type ClaimMode = "keep" | "replace";

export type ClaimResult =
  /** Plano gravado na conta. */
  | { status: "saved" }
  /** Esse mesmo rascunho já tinha sido gravado (duplo toque, rede lenta): nada foi duplicado. */
  | { status: "already" }
  /** A conta já tem plano e a pessoa escolheu "Usar o plano salvo": nada foi gravado. */
  | { status: "kept" }
  /** A conta já tem plano: é preciso escolher entre usar o salvo e substituir. Nada foi gravado. */
  | { status: "has_plan" }
  /** O rascunho tem um valor que não passa nas regras (ex.: saldo acima do valor da conta). */
  | { status: "invalid"; error: string };

/**
 * Grava o rascunho do onboarding (contas fixas, metas, saldos iniciais e configurações) na conta de
 * `userId`, numa ÚNICA transação do banco, e é idempotente por `draftId`.
 *
 * - Conta sem plano: grava e pronto.
 * - Conta com plano: sem `mode`, devolve `has_plan` e não grava nada; `keep` descarta o rascunho;
 *   `replace` zera os saldos antigos (um `adjustment` `reset` por item), ARQUIVA as contas e metas
 *   antigas (o histórico fica) e grava o novo plano.
 */
export async function claimDraftFor(
  userId: string,
  draftId: string,
  draft: OnboardingDraft,
  mode: ClaimMode | undefined,
  today: ISODate = todayISO(),
): Promise<ClaimResult> {
  // Regras dos saldos iniciais conferidas ANTES de abrir a transação (erro de quem digitou, não do servidor).
  for (const b of draft.bills) {
    const check = checkBillOpening(b.opening ?? { mode: "none" }, b.amountCents, b.dueDay, today);
    if (!check.ok) return { status: "invalid", error: check.error };
  }
  for (const g of draft.goals) {
    const check = checkGoalOpening(g.openingCents ?? 0, g.targetCents);
    if (!check.ok) return { status: "invalid", error: check.error };
  }

  try {
    return await db.$transaction(async (tx): Promise<ClaimResult> => {
      // A chave única (userId, draftId) é o que impede a duplicação mesmo com dois pedidos simultâneos.
      if (await tx.onboardingClaim.findUnique({ where: { userId_draftId: { userId, draftId } } })) return { status: "already" };

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const existing = (await tx.bill.count({ where: { userId, ...active } })) + (await tx.goal.count({ where: { userId, ...active } }));
      const hasPlan = user.onboarded || existing > 0;

      if (hasPlan) {
        if (!mode) return { status: "has_plan" };
        if (mode === "keep") return { status: "kept" };
        await resetAllIn(tx, { id: userId, weekStartDay: user.weekStartDay }, today);
        const archivedAt = new Date();
        await tx.bill.updateMany({ where: { userId, ...active }, data: { archivedAt } });
        await tx.goal.updateMany({ where: { userId, ...active }, data: { archivedAt } });
      }

      await tx.onboardingClaim.create({ data: { userId, draftId } });
      await tx.user.update({ where: { id: userId }, data: { weeklyLivingCents: draft.weeklyLivingCents, onboarded: true } });
      for (const b of draft.bills) {
        await createBillIn(tx, userId, { name: b.name, amountCents: b.amountCents, dueDay: b.dueDay }, b.opening ?? { mode: "none" }, today);
      }
      for (const g of draft.goals) {
        await createGoalIn(
          tx,
          userId,
          { name: g.name, targetCents: g.targetCents, deadline: g.deadline, weeklyCents: g.deadline ? 0 : (g.weeklyCents ?? 0), isEmergency: g.isEmergency },
          g.openingCents ?? 0,
          today,
          { keepEmergencyFlags: true },
        );
      }
      return { status: "saved" };
    });
  } catch (e) {
    // Dois pedidos do mesmo rascunho ao mesmo tempo: o segundo bate na chave única e volta aqui.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { status: "already" };
    throw e;
  }
}
