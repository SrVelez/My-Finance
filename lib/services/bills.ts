import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  checkBillOpening,
  daysBetween,
  lastDueOnOrBefore,
  nextDue,
  openDue,
  openDueAmount,
  paidRecently,
  payBill,
  settleBill,
  weeklyReceiptsUntil,
  type BillOpeningInput,
  type ISODate,
} from "@/lib/engine";
import { formatEUR, type Cents } from "@/lib/money";
import { fail, ok, type ActionResult } from "@/lib/result";
import { todayISO } from "@/lib/today";
import { billCycleData, createdAtOf, toBillState, toDbDate, weekStats } from "./state";
import { NotFoundError } from "@/lib/auth/errors";
import { active } from "./scope";
import { getUser } from "./user";

/** Vencimento que espera uma resposta do usuário. */
export interface OpenDue {
  /** `pending`: "Você pagou?"; `overdue`: disse que não pagou (ou pagou só parte). */
  kind: "pending" | "overdue";
  due: ISODate;
  /** Quanto custa esse vencimento (ou o que ainda falta pagar dele). */
  owedCents: Cents;
  /** Dinheiro já guardado para ele. */
  fundsCents: Cents;
}

export interface BillView {
  id: string;
  name: string;
  amountCents: Cents;
  dueDay: number;
  /** Próximo vencimento (ou o que está em atraso). */
  due: ISODate;
  /** Meta da barra de progresso: o valor da conta, ou o que falta de um atraso. */
  targetCents: Cents;
  savedCents: Cents;
  covered: boolean;
  /** Dias até o vencimento (negativo se já passou). */
  daysLeft: number;
  /** Recebimentos semanais que ainda cabem até o vencimento. */
  receiptsLeft: number;
  open: OpenDue | null;
}

export interface BillsOverview {
  totalCents: Cents;
  /** Todas as contas, pelo vencimento mais próximo. */
  upcoming: BillView[];
  /** "Já venceram": pagamentos confirmados nos últimos dias. */
  paid: { id: string; name: string; amountCents: Cents; confirmedThrough: ISODate }[];
}

export async function listBills(userId: string, today: ISODate): Promise<BillsOverview> {
  const rows = await db.bill.findMany({ where: { userId, ...active }, orderBy: { id: "asc" } });

  const upcoming: BillView[] = [];
  const paid: BillsOverview["paid"] = [];
  for (const row of rows) {
    const settled = settleBill(toBillState(row), today);
    const overdue = !!settled.unpaidDue;
    const due = nextDue(settled, today);
    const open = openDue(settled);
    const targetCents = overdue ? openDueAmount(settled) : row.amountCents;
    const savedCents = overdue ? settled.consumedCents : settled.savedCents;

    upcoming.push({
      id: row.id,
      name: row.name,
      amountCents: row.amountCents,
      dueDay: row.dueDay,
      due,
      targetCents,
      savedCents,
      covered: savedCents >= targetCents,
      daysLeft: daysBetween(today, due),
      receiptsLeft: weeklyReceiptsUntil(today, due),
      open: open
        ? { kind: overdue ? "overdue" : "pending", due: open, owedCents: openDueAmount(settled), fundsCents: settled.consumedCents }
        : null,
    });
    if (paidRecently(settled, today) && settled.confirmedThrough) {
      paid.push({ id: row.id, name: row.name, amountCents: row.amountCents, confirmedThrough: settled.confirmedThrough });
    }
  }
  upcoming.sort((a, b) => a.due.localeCompare(b.due));
  return { totalCents: rows.reduce((s, b) => s + b.amountCents, 0), upcoming, paid };
}

/** A conta do usuário, ou `null` se não existe ou é de outra pessoa (a tela responde 404). */
export async function getBill(userId: string, id: string) {
  return db.bill.findFirst({ where: { id, userId, ...active } });
}

export interface BillInput {
  name: string;
  amountCents: Cents;
  dueDay: number;
}

/**
 * Cria a conta. Com saldo inicial parcial, ela já nasce com esse valor guardado para o próximo
 * vencimento; com "já paguei este mês", só fica registrado (o ciclo seguinte começa em €0, como
 * toda conta nova cujo vencimento deste mês já passou).
 */
export async function createBillIn(
  tx: Prisma.TransactionClient,
  userId: string,
  input: BillInput,
  opening: BillOpeningInput,
  today: ISODate,
) {
  const check = checkBillOpening(opening, input.amountCents, input.dueDay, today);
  if (!check.ok) throw new Error(check.error);

  const lastDue = lastDueOnOrBefore(input.dueDay, today);
  const bill = await tx.bill.create({
    data: {
      userId,
      ...input,
      savedCents: check.savedCents,
      createdAt: createdAtOf(today),
      ...(check.paidBefore ? { paidThrough: lastDue, confirmedThrough: lastDue } : {}),
    },
  });
  if (check.savedCents > 0 || check.paidBefore) {
    await tx.transaction.create({
      data: {
        userId,
        type: "opening_balance",
        amountCents: check.savedCents,
        reason: check.paidBefore ? "paid_before" : null,
        date: toDbDate(today),
        billId: bill.id,
        note: bill.name,
        balanceAfterCents: check.savedCents,
      },
    });
  }
}

export async function createBillFor(
  userId: string,
  input: BillInput,
  opening: BillOpeningInput = { mode: "none" },
  today: ISODate = todayISO(),
) {
  await db.$transaction((tx) => createBillIn(tx, userId, input, opening, today));
}

export async function updateBill(userId: string, id: string, input: BillInput) {
  const { count } = await db.bill.updateMany({ where: { id, userId, ...active }, data: input });
  if (count === 0) throw new NotFoundError("Conta não encontrada.");
}

export async function deleteBill(userId: string, id: string) {
  const { count } = await db.bill.deleteMany({ where: { id, userId, ...active } });
  if (count === 0) throw new NotFoundError("Conta não encontrada.");
}

/**
 * "Você pagou?": `paidCents` omitido = paguei tudo; `0` = ainda não paguei; outro
 * valor = pagamento parcial. O que não estava guardado sai do livre da semana.
 */
export async function confirmBillPayment(userId: string, id: string, paidCents: Cents | null, today: ISODate): Promise<ActionResult> {
  const row = await db.bill.findFirst({ where: { id, userId, ...active } });
  if (!row) return fail("Conta não encontrada.");

  const settled = settleBill(toBillState(row), today);
  const owed = openDueAmount(settled);
  if (paidCents !== null && (!Number.isInteger(paidCents) || paidCents < 0 || paidCents > owed)) {
    return fail(`Informe um valor entre €0 e ${formatEUR(owed)}.`);
  }
  const payment = payBill(settled, paidCents ?? undefined);
  if (!payment) return fail("Não há vencimento para confirmar.");

  await db.$transaction(async (tx) => {
    await tx.bill.updateMany({ where: { id, userId }, data: billCycleData(payment.bill) });
    if (payment.paidCents > 0) {
      await tx.transaction.create({
        data: {
          userId,
          type: "bill_payment",
          amountCents: payment.paidCents,
          date: toDbDate(payment.dueDate),
          billId: id,
          note: row.name,
          category: "conta",
        },
      });
    }
    if (payment.fromFreeCents > 0) {
      // A parte que não estava guardada saiu do dinheiro livre: aparece no extrato e reduz o livre.
      await tx.transaction.create({
        data: {
          userId,
          type: "expense",
          amountCents: payment.fromFreeCents,
          date: toDbDate(today),
          billId: id,
          note: row.name,
          category: "Conta",
        },
      });
    }
  });
  return ok();
}

/** Guardar (do livre da semana) ou retirar (de volta ao livre) um valor da conta. */
export async function moveBillMoney(
  userId: string,
  id: string,
  direction: "in" | "out",
  cents: Cents,
  today: ISODate,
): Promise<ActionResult> {
  if (!Number.isInteger(cents) || cents <= 0) return fail("Informe um valor maior que zero.");
  const row = await db.bill.findFirst({ where: { id, userId, ...active } });
  if (!row) return fail("Conta não encontrada.");

  const settled = settleBill(toBillState(row), today);
  const overdue = !!settled.unpaidDue;
  const target = overdue ? openDueAmount(settled) : settled.amountCents;
  const have = overdue ? settled.consumedCents : settled.savedCents;

  if (direction === "in") {
    const need = target - have;
    if (need <= 0) return fail("Esta conta já está com o valor todo guardado.");
    if (cents > need) return fail(`Esta conta só precisa de mais ${formatEUR(need)}.`);
    const { weekStartDay } = await getUser(userId);
    const week = await weekStats(userId, today, weekStartDay);
    if (cents > week.freeLeftCents) {
      return fail(`Você só tem ${formatEUR(Math.max(week.freeLeftCents, 0))} livres esta semana.`);
    }
  } else if (cents > have) {
    return fail(`Há só ${formatEUR(have)} guardados nesta conta.`);
  }

  const delta = direction === "in" ? cents : -cents;
  const next = overdue
    ? { ...settled, consumedCents: have + delta }
    : { ...settled, savedCents: have + delta };

  await db.$transaction([
    db.bill.updateMany({ where: { id, userId }, data: billCycleData(next) }),
    db.transaction.create({
      data: {
        userId,
        type: direction === "in" ? "allocation" : "withdrawal",
        amountCents: cents,
        date: toDbDate(today),
        billId: id,
        note: row.name,
        category: "manual",
      },
    }),
  ]);
  return ok();
}
