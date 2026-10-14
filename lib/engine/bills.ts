import { formatEUR, roundToEuro, type Cents } from "@/lib/money";
import {
  daysBetween,
  formatDayMonth,
  lastDueOnOrBefore,
  nextDueAfter,
  nextDueOnOrAfter,
  weeklyReceiptsUntil,
} from "./dates";
import type { EngineBill, ISODate } from "./types";

/** Um mês = 4 parcelas semanais. */
export const WEEKS_PER_CYCLE = 4;

/** Próximo vencimento a ser guardado: depois do último pago, ou o próximo em/após hoje. */
export function nextDue(bill: EngineBill, today: ISODate): ISODate {
  if (bill.unpaidDue) return bill.unpaidDue;
  if (bill.paidThrough && bill.paidThrough >= today) return nextDueAfter(bill.dueDay, bill.paidThrough);
  return nextDueOnOrAfter(bill.dueDay, today);
}

/**
 * Se o vencimento mais recente já passou e não foi marcado como "não pago",
 * a conta é considerada paga: o saldo do ciclo é consumido e o próximo começa em €0.
 */
export function settleBill(bill: EngineBill, today: ISODate): EngineBill {
  const last = lastDueOnOrBefore(bill.dueDay, today);
  if (bill.unpaidDue === last) return bill;
  if (bill.paidThrough && bill.paidThrough >= last) return bill;
  // Vencimento anterior à criação da conta: não é dela, só inicializa o ciclo.
  if (last <= bill.createdOn) return { ...bill, paidThrough: last };
  return {
    ...bill,
    paidThrough: last,
    consumedCents: bill.savedCents,
    savedCents: 0,
    unpaidDue: null,
  };
}

/** "Não foi pago": devolve o saldo consumido e volta a cobrar o valor. */
export function markUnpaid(bill: EngineBill): EngineBill {
  if (!bill.paidThrough) return bill;
  return {
    ...bill,
    unpaidDue: bill.paidThrough,
    paidThrough: null,
    savedCents: bill.consumedCents,
    consumedCents: 0,
  };
}

/** Contas "Já venceram": consideradas pagas nos últimos 14 dias. */
export function recentlyDue(bill: EngineBill, today: ISODate): boolean {
  return (
    !!bill.paidThrough &&
    bill.paidThrough > bill.createdOn &&
    bill.paidThrough <= today &&
    daysBetween(bill.paidThrough, today) <= 14
  );
}

export interface BillPlan {
  amountCents: Cents;
  reason: string;
  due: ISODate;
  payments: number;
}

export function planBill(bill: EngineBill, today: ISODate, assumeFreshCycle = false): BillPlan {
  const due = nextDue(bill, today);
  const falta = Math.max(0, bill.amountCents - bill.savedCents);
  if (falta === 0) return { amountCents: 0, reason: "Valor todo guardado", due, payments: 0 };

  const overdue = due <= today;
  const byInstallment = Math.ceil((falta * WEEKS_PER_CYCLE) / bill.amountCents);
  const byCalendar = assumeFreshCycle ? Infinity : overdue ? 1 : weeklyReceiptsUntil(today, due);
  const payments = Math.max(1, Math.min(byInstallment, byCalendar));

  const reason =
    payments === 1 && falta < bill.amountCents
      ? `Complete os ${formatEUR(bill.amountCents)} de ${formatDayMonth(due)}`
      : `${falta === bill.amountCents ? "" : "Faltam "}${formatEUR(falta)} até ${formatDayMonth(due)}, em ${payments} pagamentos`;

  return { amountCents: roundToEuro(falta / payments), reason, due, payments };
}

/** "Paguei": quita um vencimento marcado como não pago; o saldo é consumido. */
export function markPaid(bill: EngineBill): EngineBill {
  if (!bill.unpaidDue) return bill;
  return {
    ...bill,
    paidThrough: bill.unpaidDue,
    consumedCents: bill.savedCents,
    savedCents: 0,
    unpaidDue: null,
  };
}
