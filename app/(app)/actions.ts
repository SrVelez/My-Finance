"use server";

import { revalidatePath } from "next/cache";
import { moveBillMoney } from "@/lib/services/bills";
import { moveGoalMoney } from "@/lib/services/goals";
import { fail, type ActionResult } from "@/lib/result";
import { serverToday } from "@/lib/services/today";

/** Guardar (do livre) ou retirar (para o livre) dinheiro de uma conta ou meta, à mão. */
export async function moveMoneyAction(
  kind: "bill" | "goal",
  id: string,
  direction: "in" | "out",
  cents: number,
): Promise<ActionResult> {
  if ((kind !== "bill" && kind !== "goal") || (direction !== "in" && direction !== "out") || typeof id !== "string") {
    return fail("Pedido inválido.");
  }
  try {
    const today = await serverToday();
    const result = kind === "bill" ? await moveBillMoney(id, direction, cents, today) : await moveGoalMoney(id, direction, cents, today);
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch {
    return fail("Não foi possível movimentar. Tente de novo.");
  }
}
