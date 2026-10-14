import { describe, expect, it } from "vitest";
import { euros } from "@/lib/money";
import {
  coverShortfallFromReserve,
  distribute,
  freeAfterExpense,
  markUnpaid,
  nextDue,
  planBill,
  recentlyDue,
  settleBill,
  suggestWeekly,
} from "@/lib/engine";
import { bill, midCycleState, zeroState } from "./fixtures";

const amounts = (d: ReturnType<typeof distribute>) =>
  Object.fromEntries(d.allocations.map((a) => [a.id, a.amountCents / 100]));

const deepFreeze = <T extends object>(o: T): T => {
  Object.values(o).forEach((v) => typeof v === "object" && v && deepFreeze(v));
  return Object.freeze(o);
};

describe("caso 1 — prévia do onboarding, recebendo €500 (tudo zerado)", () => {
  const d = distribute({ incomeCents: euros(500), date: "2026-10-08", state: zeroState(), assumeFreshCycle: true });

  it("contas €196 e metas €58", () => {
    expect(amounts(d)).toEqual({ aluguel: 160, curso: 31, telefone: 5, visto: 16, reserva: 25, viagem: 17 });
    expect(d.billsCents).toBe(euros(196));
    expect(d.goalsCents).toBe(euros(58));
  });

  it("livre €246 = €120 dia a dia + €126 de folga", () => {
    expect(d.freeCents).toBe(euros(246));
    expect(d.livingCents).toBe(euros(120));
    expect(d.slackCents).toBe(euros(126));
  });
});

describe("caso 2 — recebi €500 em 8/out", () => {
  const d = distribute({ incomeCents: euros(500), date: "2026-10-08", state: midCycleState() });
  const reason = (id: string) => d.allocations.find((a) => a.id === id)!.reason;

  it("valores por item", () => {
    expect(amounts(d)).toEqual({ aluguel: 160, curso: 31, telefone: 5, visto: 11, reserva: 25, viagem: 14 });
  });

  it("para guardar €246, livre €254 (€120 + €134 de folga)", () => {
    expect(d.toSaveCents).toBe(euros(246));
    expect(d.freeCents).toBe(euros(254));
    expect(d.slackCents).toBe(euros(134));
  });

  it("motivos exibidos", () => {
    expect(reason("aluguel")).toBe("Faltam €320 até 1/nov, em 2 pagamentos");
    expect(reason("curso")).toBe("€125 até 10/nov, em 4 pagamentos");
    expect(reason("telefone")).toBe("Complete os €20 de 20/out");
    expect(reason("visto")).toBe("Faltam €204 até fev/2027");
    expect(reason("reserva")).toBe("Valor semanal que você definiu");
    expect(reason("viagem")).toBe("Faltam €515 até jun/2027");
  });
});

describe("caso 3 — recebi €280 (não deu para tudo)", () => {
  const state = midCycleState();
  const d = distribute({ incomeCents: euros(280), date: "2026-10-08", state });

  it("contas cobertas, dia a dia €84, metas pausadas, faltaram €36", () => {
    expect(d.billsCents).toBe(euros(196));
    expect(d.livingCents).toBe(euros(84));
    expect(d.goalsCents).toBe(0);
    expect(d.shortfallCents).toBe(euros(36));
    expect(d.freeCents).toBe(euros(84));
    expect(d.allocations.filter((a) => a.kind === "goal").every((a) => a.reason === "Pausada nesta semana")).toBe(true);
  });

  it("opção A: €36 da reserva (€150 → €114), livre €120", () => {
    const a = coverShortfallFromReserve(d, state.goals);
    expect(a.withdrawalCents).toBe(euros(36));
    expect(a.reserveBeforeCents).toBe(euros(150));
    expect(a.reserveAfterCents).toBe(euros(114));
    expect(a.freeCents).toBe(euros(120));
  });

  it("opção B: livre €84, metas intactas", () => {
    expect(d.freeCents).toBe(euros(84));
    expect(state.goals.map((g) => g.savedCents)).toEqual([euros(96), euros(150), euros(85)]);
  });
});

describe("caso 4 — gastei €23,50 (Mercado)", () => {
  it("com €168 livres sobram €144,50", () => {
    expect(freeAfterExpense(euros(168), 2350)).toBe(14450);
  });
});

describe("caso 5 — simulação não altera saldos", () => {
  it("não muta o estado de entrada", () => {
    const state = deepFreeze(zeroState());
    const before = JSON.stringify(state);
    expect(() => distribute({ incomeCents: euros(500), date: "2026-10-08", state, assumeFreshCycle: true })).not.toThrow();
    expect(JSON.stringify(state)).toBe(before);
    expect(state.bills.every((b) => b.savedCents === 0)).toBe(true);
    expect(state.goals.every((g) => g.savedCents === 0)).toBe(true);
  });
});

describe("caso 6 — vencimento passado", () => {
  const aluguel = bill({
    id: "aluguel",
    name: "Aluguel",
    amountCents: euros(640),
    dueDay: 1,
    savedCents: euros(640),
    paidThrough: "2026-09-01",
  });
  const today = "2026-10-08";

  it("Aluguel de 1/out é considerado pago e o novo ciclo começa em €0", () => {
    const settled = settleBill(aluguel, today);
    expect(settled.paidThrough).toBe("2026-10-01");
    expect(settled.savedCents).toBe(0);
    expect(recentlyDue(settled, today)).toBe(true);
    expect(nextDue(settled, today)).toBe("2026-11-01");
  });

  it('"Não foi pago" reverte e volta a cobrar', () => {
    const unpaid = markUnpaid(settleBill(aluguel, today));
    expect(unpaid.unpaidDue).toBe("2026-10-01");
    expect(unpaid.savedCents).toBe(euros(640));
    expect(recentlyDue(unpaid, today)).toBe(false);
    expect(settleBill(unpaid, today)).toEqual(unpaid);
    expect(nextDue(unpaid, today)).toBe("2026-10-01");
  });

  it("conta vencida sem saldo é cobrada por inteiro agora", () => {
    const unpaid = markUnpaid(settleBill({ ...aluguel, savedCents: 0, paidThrough: "2026-09-01" }, today));
    expect(planBill({ ...unpaid, savedCents: 0 }, today).amountCents).toBe(euros(640));
  });
});

describe("extras", () => {
  it("sugestão de valor semanal sem prazo (~16 semanas)", () => {
    expect(suggestWeekly(euros(400))).toBe(euros(25));
  });

  it("dinheiro insuficiente para as contas: cobre na ordem e zera o resto", () => {
    const d = distribute({ incomeCents: euros(100), date: "2026-10-08", state: zeroState(), assumeFreshCycle: true });
    expect(amounts(d)).toMatchObject({ aluguel: 100, curso: 0, telefone: 0 });
    expect(d.livingCents).toBe(0);
    expect(d.shortfallCents).toBe(euros(120));
  });
});

describe("quitar conta vencida", () => {
  it("'Paguei' consome o saldo e libera o próximo ciclo", async () => {
    const { markPaid } = await import("@/lib/engine");
    const a = bill({ id: "a", name: "Aluguel", amountCents: euros(640), dueDay: 1, savedCents: euros(640), paidThrough: "2026-09-01" });
    const unpaid = markUnpaid(settleBill(a, "2026-10-08"));
    const paid = markPaid(unpaid);
    expect(paid.unpaidDue).toBeNull();
    expect(paid.savedCents).toBe(0);
    expect(paid.paidThrough).toBe("2026-10-01");
    expect(nextDue(paid, "2026-10-08")).toBe("2026-11-01");
    expect(markPaid(a)).toBe(a);
  });
});

describe("conta criada depois do vencimento", () => {
  const today = "2026-10-14";
  it("vencimento anterior à criação não é considerado pago", () => {
    const nova = bill({ id: "n", name: "Nova", amountCents: euros(100), dueDay: 1, createdOn: "2026-10-14" });
    const settled = settleBill(nova, today);
    expect(settled.savedCents).toBe(nova.savedCents);
    expect(recentlyDue(settled, today)).toBe(false);
    expect(nextDue(settled, today)).toBe("2026-11-01");
  });
  it("conta que já existia antes do vencimento é liquidada", () => {
    const antiga = bill({ id: "a", name: "Antiga", amountCents: euros(100), dueDay: 1, savedCents: euros(60), createdOn: "2026-09-01" });
    const settled = settleBill(antiga, today);
    expect(settled.paidThrough).toBe("2026-10-01");
    expect(settled.savedCents).toBe(0);
    expect(recentlyDue(settled, today)).toBe(true);
  });
});
