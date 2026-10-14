"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createBill,
  deleteBill,
  markBillPaid,
  markBillUnpaid,
  updateBill,
  type BillInput,
} from "@/lib/services/bills";
import { serverToday } from "@/lib/services/today";
import { assertCents, assertDueDay, assertName } from "@/lib/validate";

function parse(input: BillInput): BillInput {
  return {
    name: assertName(input.name),
    amountCents: assertCents(input.amountCents, { min: 1 }),
    dueDay: assertDueDay(input.dueDay),
  };
}

const refresh = () => {
  revalidatePath("/contas");
  revalidatePath("/");
};

export async function createBillAction(input: BillInput) {
  await createBill(parse(input));
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

export async function markUnpaidAction(id: string) {
  await markBillUnpaid(id, await serverToday());
  refresh();
}

export async function markPaidAction(id: string) {
  await markBillPaid(id, await serverToday());
  refresh();
}
