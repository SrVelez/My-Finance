import { describe, expect, it } from "vitest";
import { buildStatement, type StatementRow } from "@/lib/statement";

let n = 0;
const row = (p: Partial<StatementRow> & Pick<StatementRow, "type" | "amountCents">): StatementRow => ({
  id: `t${++n}`,
  category: null,
  date: "2026-10-08",
  note: null,
  groupId: null,
  billId: null,
  goalId: null,
  billName: null,
  goalName: null,
  createdAt: n,
  ...p,
});

describe("extrato", () => {
  it("recebimento mostra para onde foi cada euro e quanto sobrou livre", () => {
    const rows = [
      row({ type: "income", amountCents: 50000, groupId: "g1" }),
      row({ type: "allocation", amountCents: 16000, groupId: "g1", billId: "b1", billName: "Aluguel" }),
      row({ type: "allocation", amountCents: 2500, groupId: "g1", goalId: "m1", goalName: "Reserva" }),
    ];
    const [income] = buildStatement(rows);
    expect(income).toMatchObject({ kind: "income", amountCents: 50000 });
    if (income.kind !== "income") throw new Error();
    expect(income.lines.map((l) => [l.kind, l.label, l.amountCents])).toEqual([
      ["bill", "Aluguel", 16000],
      ["goal", "Reserva", 2500],
      ["free", "Livre para gastar", 31500],
    ]);
  });

  it("retirada da reserva soma ao livre", () => {
    const rows = [
      row({ type: "income", amountCents: 28000, groupId: "g" }),
      row({ type: "allocation", amountCents: 19600, groupId: "g", billId: "b", billName: "Contas" }),
      row({ type: "withdrawal", amountCents: 3600, groupId: "g", goalId: "r", goalName: "Reserva" }),
    ];
    const [income] = buildStatement(rows);
    if (income.kind !== "income") throw new Error();
    expect(income.lines.at(-1)).toMatchObject({ kind: "free", amountCents: 28000 - 19600 + 3600 });
    expect(income.lines.find((l) => l.kind === "reserve")?.amountCents).toBe(3600);
  });

  it("usa o nome guardado quando a conta foi excluída", () => {
    const rows = [
      row({ type: "income", amountCents: 10000, groupId: "g" }),
      row({ type: "allocation", amountCents: 1000, groupId: "g", note: "Internet", category: "conta" }),
    ];
    const [income] = buildStatement(rows);
    if (income.kind !== "income") throw new Error();
    expect(income.lines[0]).toMatchObject({ kind: "bill", label: "Internet" });
  });

  it("ordena do mais recente ao mais antigo e inclui despesas", () => {
    const rows = [
      row({ type: "income", amountCents: 100, date: "2026-10-01", groupId: "a" }),
      row({ type: "expense", amountCents: 2350, date: "2026-10-09", category: "Mercado" }),
      row({ type: "expense", amountCents: 500, date: "2026-10-09", category: "Transporte" }),
    ];
    const out = buildStatement(rows);
    expect(out.map((e) => e.kind)).toEqual(["expense", "expense", "income"]);
    // mesmo dia: o criado depois vem primeiro
    expect(out[0]).toMatchObject({ category: "Transporte" });
    expect(out[1]).toMatchObject({ category: "Mercado", amountCents: 2350 });
  });

  it("recebimento antigo sem agrupamento aparece sem linhas; alocação solta vira movimento", () => {
    const rows = [
      row({ type: "income", amountCents: 9000 }),
      row({ type: "allocation", amountCents: 1000, billName: "Aluguel" }),
    ];
    const out = buildStatement(rows);
    const income = out.find((e) => e.kind === "income");
    expect(income && income.kind === "income" && income.lines).toEqual([]);
    expect(out.find((e) => e.kind === "movement")).toMatchObject({ label: "Aluguel", sign: -1 });
  });
});

import { billHistory, goalHistory, groupByDate, type ItemTxRow } from "@/lib/statement";

let m = 0;
const tx = (p: Partial<ItemTxRow> & Pick<ItemTxRow, "type" | "amountCents">): ItemTxRow => ({
  id: `x${++m}`,
  date: "2026-10-08",
  groupId: null,
  createdAt: m,
  ...p,
});

describe("extrato de uma conta/meta", () => {
  const incomes = new Map([["g1", 50000]]);

  it("conta: lista só o que foi guardado, citando o recebimento de origem", () => {
    const items = billHistory(
      [tx({ type: "allocation", amountCents: 16000, groupId: "g1" }), tx({ type: "income", amountCents: 50000 })],
      incomes,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ label: "Guardado para a conta", sign: 1, amountCents: 16000, detail: "Do recebimento de €500" });
  });

  it("meta: guardado soma, retirada subtrai", () => {
    const items = goalHistory(
      [tx({ type: "allocation", amountCents: 2500, groupId: "g1" }), tx({ type: "withdrawal", amountCents: 3600 })],
      incomes,
    );
    expect(items.map((i) => [i.label, i.sign])).toEqual([["Guardado na meta", 1], ["Retirado da meta", -1]]);
  });

  it("agrupa por data, mais recente primeiro, e ordena dentro do dia", () => {
    const items = goalHistory(
      [
        tx({ type: "allocation", amountCents: 100, date: "2026-10-01" }),
        tx({ type: "allocation", amountCents: 200, date: "2026-10-08" }),
        tx({ type: "allocation", amountCents: 300, date: "2026-10-08" }),
      ],
      incomes,
    );
    const days = groupByDate(items);
    expect(days.map((d) => d.date)).toEqual(["2026-10-08", "2026-10-01"]);
    expect(days[0].items.map((i) => i.amountCents)).toEqual([300, 200]);
  });
});
