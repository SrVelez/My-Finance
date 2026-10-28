import { describe, expect, it } from "vitest";
import { euros } from "@/lib/money";
import { coverShortfallFromReserve, distribute, freeAfterExpense, previewAllocations } from "@/lib/engine";
import { midCycleState, zeroState } from "./fixtures";

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

describe("previewAllocations", () => {
  it("livre = recebido − guardado; dia a dia limitado ao gasto semanal", () => {
    expect(previewAllocations(euros(500), [euros(196), euros(58)], euros(120))).toEqual({
      toSaveCents: euros(254),
      freeCents: euros(246),
      livingCents: euros(120),
      over: false,
    });
  });
  it("livre menor que o gasto semanal: o dia a dia leva tudo", () => {
    expect(previewAllocations(euros(300), [euros(250)], euros(120))).toMatchObject({ freeCents: euros(50), livingCents: euros(50), over: false });
  });
  it("valores acima do recebido: livre negativo, dia a dia zero e aviso", () => {
    expect(previewAllocations(euros(100), [euros(150)], euros(120))).toEqual({
      toSaveCents: euros(150),
      freeCents: -euros(50),
      livingCents: 0,
      over: true,
    });
  });
  it("sem valores: tudo é livre", () => {
    expect(previewAllocations(euros(80), [], euros(120))).toMatchObject({ toSaveCents: 0, freeCents: euros(80), livingCents: euros(80) });
  });
});
