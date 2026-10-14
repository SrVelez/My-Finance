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

/** Próximo vencimento a ser guardado: o que está em atraso, ou o próximo em/após hoje. */
export function nextDue(bill: EngineBill, today: ISODate): ISODate {
  if (bill.unpaidDue) return bill.unpaidDue;
  if (bill.paidThrough && bill.paidThrough >= today) return nextDueAfter(bill.dueDay, bill.paidThrough);
  return nextDueOnOrAfter(bill.dueDay, today);
}

/**
 * Quando um vencimento passa, o ciclo fecha: o que foi guardado fica **retido**
 * (`consumedCents`) esperando o usuário confirmar o pagamento, e o próximo ciclo
 * começa em €0 sem esperar a resposta. Um vencimento em atraso bloqueia novos
 * fechamentos até ser resolvido.
 */
export function settleBill(bill: EngineBill, today: ISODate): EngineBill {
  if (bill.unpaidDue) return bill;
  const last = lastDueOnOrBefore(bill.dueDay, today);
  if (bill.paidThrough && bill.paidThrough >= last) return bill;
  // Vencimento anterior à criação da conta: não é dela, só inicializa o ciclo.
  if (last <= bill.createdOn) return { ...bill, paidThrough: last };
  return { ...bill, paidThrough: last, consumedCents: bill.savedCents, savedCents: 0 };
}

/** Vencimento já passado que ainda espera a resposta "Você pagou?". */
export function pendingDue(bill: EngineBill): ISODate | null {
  if (bill.unpaidDue || !bill.paidThrough || bill.paidThrough <= bill.createdOn) return null;
  return !bill.confirmedThrough || bill.confirmedThrough < bill.paidThrough ? bill.paidThrough : null;
}

/** Vencimento sem resposta final: a confirmar ou em atraso. */
export const openDue = (bill: EngineBill): ISODate | null => bill.unpaidDue ?? pendingDue(bill);

/** Quanto custa o vencimento em aberto. */
export const openDueAmount = (bill: EngineBill): Cents =>
  bill.unpaidDue ? bill.unpaidCents || bill.amountCents : bill.amountCents;

/** Pago e confirmado recentemente (seção "Já venceram"). */
export function paidRecently(bill: EngineBill, today: ISODate): boolean {
  return (
    !bill.unpaidDue &&
    !!bill.confirmedThrough &&
    bill.confirmedThrough > bill.createdOn &&
    bill.confirmedThrough <= today &&
    daysBetween(bill.confirmedThrough, today) <= 14
  );
}

export interface Payment {
  bill: EngineBill;
  /** Quanto foi pago neste vencimento. */
  paidCents: Cents;
  /** Parte que não estava guardada: sai do "livre" da semana. */
  fromFreeCents: Cents;
  dueDate: ISODate;
}

/**
 * "Você pagou?": registra o pagamento do vencimento em aberto.
 * `paidCents` omitido = valor todo; `0` = ainda não paguei (vira atraso).
 * O que faltar no guardado sai do livre; o que sobrar do guardado vai para o próximo ciclo.
 */
export function payBill(bill: EngineBill, paidCents?: Cents): Payment | null {
  const due = openDue(bill);
  if (!due) return null;
  const owedBefore = openDueAmount(bill);
  const funds = bill.consumedCents;
  const paid = Math.min(Math.max(paidCents ?? owedBefore, 0), owedBefore);
  const fromFree = Math.max(0, paid - funds);
  const heldLeft = Math.max(0, funds - paid);
  const owed = owedBefore - paid;
  const paidThrough = bill.paidThrough ?? due;

  const next: EngineBill =
    owed > 0
      ? { ...bill, paidThrough, unpaidDue: due, unpaidCents: owed, consumedCents: heldLeft }
      : {
          ...bill,
          paidThrough,
          unpaidDue: null,
          unpaidCents: 0,
          consumedCents: 0,
          savedCents: bill.savedCents + heldLeft,
          confirmedThrough: due,
        };
  return { bill: next, paidCents: paid, fromFreeCents: fromFree, dueDate: due };
}

export interface BillPlan {
  amountCents: Cents;
  reason: string;
  due: ISODate;
  payments: number;
}

export function planBill(bill: EngineBill, today: ISODate, assumeFreshCycle = false): BillPlan {
  const due = nextDue(bill, today);

  // Em atraso: separa já o que falta do vencimento em aberto (valor exato, sem arredondar).
  if (bill.unpaidDue) {
    const falta = Math.max(0, openDueAmount(bill) - bill.consumedCents);
    return {
      amountCents: falta,
      reason: falta === 0 ? "Valor todo guardado" : `Venceu em ${formatDayMonth(due)} · faltam ${formatEUR(falta)}`,
      due,
      payments: falta === 0 ? 0 : 1,
    };
  }

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
