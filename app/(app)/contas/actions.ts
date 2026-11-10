"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createBill,
  deleteBill,
  confirmBillPayment,
  updateBill,
  type BillInput,
} from "@/lib/services/bills";
import type { BillOpeningInput } from "@/lib/engine";
import { fail, type ActionResult } from "@/lib/result";
import { serverToday } from "@/lib/services/today";
import { assertCents, assertDueDay, assertName } from "@/lib/validate";

function parse(input: BillInput): BillInput {
  return {
    name: assertName(input.name),
    amountCents: assertCents(input.amountCents, { min: 1 }),
    dueDay: assertDueDay(input.dueDay),
  };
}

/** Saldo inicial vindo do cliente: só os três modos conhecidos. */
function parseOpening(input: BillOpeningInput | undefined): BillOpeningInput {
  if (!input || input.mode === "none") return { mode: "none" };
  if (input.mode === "paid") return { mode: "paid" };
  if (input.mode === "partial") return { mode: "partial", cents: assertCents(input.cents) };
  throw new Error("Saldo inicial inválido");
}

const refresh = () => {
  revalidatePath("/contas");
  revalidatePath("/");
};

export async function createBillAction(input: BillInput, opening?: BillOpeningInput) {
  await createBill(parse(input), parseOpening(opening), await serverToday());
  refresh();
  redirect("/contas");
}

export async function updateBillAction(id: string, input: BillInput) {
  await updateBill(id, parse(input));
  refresh();
  redirect(`/contas/${id}`);
}

export async function deleteBillAction(id: string) {
  await deleteBill(id);
  refresh();
  redirect("/contas");
}

/**
 * "Você pagou?": `paidCents` null = paguei tudo; 0 = ainda não paguei; outro valor = parcial.
 * Falhas de regra voltam como valor (o Next esconde mensagens de erros lançados em produção).
 */
export async function confirmPaymentAction(id: string, paidCents: number | null): Promise<ActionResult> {
  try {
    const result = await confirmBillPayment(id, paidCents, await serverToday());
    if (result.ok) refresh();
    return result;
  } catch {
    return fail("Não foi possível confirmar. Tente de novo.");
  }
}
