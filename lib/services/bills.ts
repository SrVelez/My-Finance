import { db } from "@/lib/db";
import { markPaid, markUnpaid, nextDue, recentlyDue, settleBill, type ISODate } from "@/lib/engine";
import type { Cents } from "@/lib/money";
import { toBillState } from "./state";
import { getOrCreateUser } from "./user";

export interface BillView {
  id: string;
  name: string;
  amountCents: Cents;
  dueDay: number;
  due: ISODate;
  savedCents: Cents;
  covered: boolean;
  /** Marcada como "Não foi pago" e ainda a pagar. */
  overdue: boolean;
}

export interface BillsOverview {
  totalCents: Cents;
  upcoming: BillView[];
  /** "Já venceram": consideradas pagas nos últimos dias. */
  justDue: { id: string; name: string; amountCents: Cents; paidThrough: ISODate }[];
}

export async function listBills(today: ISODate): Promise<BillsOverview> {
  const user = await getOrCreateUser();
  const rows = await db.bill.findMany({ where: { userId: user.id }, orderBy: { id: "asc" } });

  const upcoming: BillView[] = [];
  const justDue: BillsOverview["justDue"] = [];
  for (const row of rows) {
    const settled = settleBill(toBillState(row), today);
    const due = nextDue(settled, today);
    upcoming.push({
      id: row.id,
      name: row.name,
      amountCents: row.amountCents,
      dueDay: row.dueDay,
      due,
      savedCents: settled.savedCents,
      covered: settled.savedCents >= row.amountCents,
      overdue: !!settled.unpaidDue,
    });
    if (recentlyDue(settled, today) && settled.paidThrough) {
      justDue.push({ id: row.id, name: row.name, amountCents: row.amountCents, paidThrough: settled.paidThrough });
    }
  }
  upcoming.sort((a, b) => a.due.localeCompare(b.due));
  return { totalCents: rows.reduce((s, b) => s + b.amountCents, 0), upcoming, justDue };
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

/** Persiste a liquidação automática e aplica `change` ("Não foi pago" / "Paguei"). */
async function changeSettled(id: string, today: ISODate, change: typeof markUnpaid) {
  const bill = await getBill(id);
  if (!bill) throw new Error("Conta não encontrada");
  const next = change(settleBill(toBillState(bill), today));
  await db.bill.update({
    where: { id },
    data: {
      paidThrough: next.paidThrough,
      consumedCents: next.consumedCents,
      unpaidDue: next.unpaidDue,
      savedCents: next.savedCents,
    },
  });
}

export const markBillUnpaid = (id: string, today: ISODate) => changeSettled(id, today, markUnpaid);
export const markBillPaid = (id: string, today: ISODate) => changeSettled(id, today, markPaid);
