import { db } from "@/lib/db";
import {
  daysBetween,
  nextDue,
  openDue,
  openDueAmount,
  paidRecently,
  payBill,
  settleBill,
  weeklyReceiptsUntil,
  type ISODate,
} from "@/lib/engine";
import { formatEUR, type Cents } from "@/lib/money";
import { fail, ok, type ActionResult } from "@/lib/result";
import { billCycleData, toBillState, toDbDate, weekStats } from "./state";
import { getOrCreateUser } from "./user";

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

export async function listBills(today: ISODate): Promise<BillsOverview> {
  const user = await getOrCreateUser();
  const rows = await db.bill.findMany({ where: { userId: user.id }, orderBy: { id: "asc" } });

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

export async function getBill(id: string) {
  const user = await getOrCreateUser();
  return db.bill.findFirst({ where: { id, userId: user.id } });
}

export interface BillInput {
  name: string;
  amountCents: Cents;
  dueDay: number;
}

export async function createBill(input: BillInput) {
  const user = await getOrCreateUser();
  await db.bill.create({ data: { userId: user.id, ...input } });
}

export async function updateBill(id: string, input: BillInput) {
  const bill = await getBill(id);
  if (!bill) throw new Error("Conta não encontrada");
  await db.bill.update({ where: { id }, data: input });
}

export async function deleteBill(id: string) {
  const bill = await getBill(id);
  if (!bill) throw new Error("Conta não encontrada");
  await db.bill.delete({ where: { id } });
}

/**
 * "Você pagou?": `paidCents` omitido = paguei tudo; `0` = ainda não paguei; outro
 * valor = pagamento parcial. O que não estava guardado sai do livre da semana.
 */
export async function confirmBillPayment(id: string, paidCents: Cents | null, today: ISODate): Promise<ActionResult> {
  const user = await getOrCreateUser();
  const row = await db.bill.findFirst({ where: { id, userId: user.id } });
  if (!row) return fail("Conta não encontrada.");

  const settled = settleBill(toBillState(row), today);
  const owed = openDueAmount(settled);
  if (paidCents !== null && (!Number.isInteger(paidCents) || paidCents < 0 || paidCents > owed)) {
    return fail(`Informe um valor entre €0 e ${formatEUR(owed)}.`);
  }
  const payment = payBill(settled, paidCents ?? undefined);
  if (!payment) return fail("Não há vencimento para confirmar.");

  await db.$transaction(async (tx) => {
    await tx.bill.update({ where: { id }, data: billCycleData(payment.bill) });
    if (payment.paidCents > 0) {
      await tx.transaction.create({
        data: {
          userId: user.id,
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
          userId: user.id,
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
  id: string,
  direction: "in" | "out",
  cents: Cents,
  today: ISODate,
): Promise<ActionResult> {
  if (!Number.isInteger(cents) || cents <= 0) return fail("Informe um valor maior que zero.");
  const user = await getOrCreateUser();
  const row = await db.bill.findFirst({ where: { id, userId: user.id } });
  if (!row) return fail("Conta não encontrada.");

  const settled = settleBill(toBillState(row), today);
  const overdue = !!settled.unpaidDue;
  const target = overdue ? openDueAmount(settled) : settled.amountCents;
  const have = overdue ? settled.consumedCents : settled.savedCents;

  if (direction === "in") {
    const need = target - have;
    if (need <= 0) return fail("Esta conta já está com o valor todo guardado.");
    if (cents > need) return fail(`Esta conta só precisa de mais ${formatEUR(need)}.`);
    const week = await weekStats(user.id, today, user.weekStartDay);
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
    db.bill.update({ where: { id }, data: billCycleData(next) }),
    db.transaction.create({
      data: {
        userId: user.id,
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
