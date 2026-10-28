import { describe, expect, it } from "vitest";
import { weekPool, weekSpent } from "@/lib/engine";

const tx = (type: string, amountCents: number) => ({ type, amountCents });

describe("weekPool / weekSpent", () => {
  const week = [tx("income", 50000), tx("allocation", 19600), tx("allocation", 5800), tx("withdrawal", 1000), tx("expense", 3000), tx("bill_payment", 999)];

  it("livre = recebido − guardado + retirado; despesas e pagamentos de conta não entram", () => {
    expect(weekPool(week)).toBe(50000 - 19600 - 5800 + 1000);
  });
  it("gasto = só despesas", () => {
    expect(weekSpent(week)).toBe(3000);
  });
  it("semana vazia é zero", () => {
    expect(weekPool([])).toBe(0);
    expect(weekSpent([])).toBe(0);
  });
});
