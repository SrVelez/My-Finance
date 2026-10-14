import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  coverShortfallFromReserve,
  distribute,
  settleBill,
  type Distribution,
  type ISODate,
  type ReserveCover,
} from "@/lib/engine";
import type { Cents } from "@/lib/money";
import { billCycleData, loadState, toBillState, toDbDate } from "./state";

export interface IncomeSimulation {
  incomeCents: Cents;
  date: ISODate;
  weeklyLivingCents: Cents;
  distribution: Distribution;
  /** Opção A (só quando faltou dinheiro para o dia a dia). */
  reserve: ReserveCover | null;
}

/** Simulação: calcula a distribuição sem alterar nenhum saldo. */
export async function simulateIncome(incomeCents: Cents, date: ISODate): Promise<IncomeSimulation> {
  const { state } = await loadState();
  const distribution = distribute({ incomeCents, date, state });
  const reserve =
    distribution.shortfallCents > 0 ? coverShortfallFromReserve(distribution, state.goals) : null;
  return { incomeCents, date, weeklyLivingCents: state.weeklyLivingCents, distribution, reserve };
}

export interface ConfirmIncomeInput {
  incomeCents: Cents;
  date: ISODate;
  /** Valores editados em "Ajustar", por id de conta/meta. */
  overrides?: Record<string, Cents>;
  /** Opção A: completa o dia a dia com a reserva de emergência. */
  useReserve?: boolean;
}

/** Confirma o recebimento: grava a receita, as alocações e os novos saldos. */
export async function confirmIncome({ incomeCents, date, overrides, useReserve }: ConfirmIncomeInput) {
  const { user, state, bills } = await loadState();
  // A distribuição é sempre recalculada aqui: o cliente nunca dita os números.
  const dist = distribute({ incomeCents, date, state });

  const amounts = new Map(dist.allocations.map((a) => [a.id, a.amountCents]));
  if (overrides && dist.shortfallCents === 0) {
    let total = 0;
    for (const [id, cents] of Object.entries(overrides)) {
      if (!amounts.has(id) || !Number.isInteger(cents) || cents < 0) throw new Error("Valor inválido");
      amounts.set(id, cents);
    }
    for (const v of amounts.values()) total += v;
    if (total > incomeCents) throw new Error("A soma passa do valor recebido");
  }

  const cover =
    useReserve && dist.shortfallCents > 0 ? coverShortfallFromReserve(dist, state.goals) : null;
  const when = toDbDate(date);
  const groupId = randomUUID();
  const goalNames = new Map(state.goals.map((g) => [g.id, g.name]));

  await db.$transaction(async (tx) => {
    await tx.transaction.create({
      data: { userId: user.id, type: "income", amountCents: incomeCents, date: when, groupId },
    });

    for (const row of bills) {
      const settled = settleBill(toBillState(row), date);
      const add = amounts.get(row.id) ?? 0;
      // Em atraso, o dinheiro novo vai para o vencimento em aberto; senão, para o ciclo atual.
      const next = settled.unpaidDue
        ? { ...settled, consumedCents: settled.consumedCents + add }
        : { ...settled, savedCents: settled.savedCents + add };
      await tx.bill.update({ where: { id: row.id }, data: billCycleData(next) });
      if (add > 0) {
        await tx.transaction.create({
          data: { userId: user.id, type: "allocation", amountCents: add, date: when, billId: row.id, groupId, note: row.name, category: "conta" },
        });
      }
    }

    for (const goal of state.goals) {
      const add = amounts.get(goal.id) ?? 0;
      if (add > 0) {
        await tx.goal.update({ where: { id: goal.id }, data: { savedCents: { increment: add } } });
        await tx.transaction.create({
          data: { userId: user.id, type: "allocation", amountCents: add, date: when, goalId: goal.id, groupId, note: goal.name, category: "meta" },
        });
      }
    }

    if (cover && cover.goalId && cover.withdrawalCents > 0) {
      await tx.goal.update({
        where: { id: cover.goalId },
        data: { savedCents: { decrement: cover.withdrawalCents } },
      });
      await tx.transaction.create({
        data: {
          userId: user.id,
          type: "withdrawal",
          amountCents: cover.withdrawalCents,
          date: when,
          goalId: cover.goalId,
          groupId,
          note: goalNames.get(cover.goalId) ?? "Reserva de emergência",
        },
      });
    }
  });
}
