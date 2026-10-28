import { describe, expect, it } from "vitest";
import { sanitizeDraft } from "@/lib/draft";
import { assertCents, assertDeadline, assertDueDay, assertISODate, assertName } from "@/lib/validate";

// Testes de caracterização: fixam o comportamento atual da validação de entrada.

describe("assertISODate", () => {
  it("aceita datas reais", () => {
    expect(assertISODate("2026-10-28")).toBe("2026-10-28");
    expect(assertISODate("2028-02-29")).toBe("2028-02-29");
  });
  it("rejeita formato errado, data inexistente e não-string", () => {
    for (const v of ["28/10/2026", "2026-2-3", "2026-02-30", "2027-02-29", "", null, 20261028]) {
      expect(() => assertISODate(v)).toThrow("Data inválida");
    }
  });
});

describe("assertCents", () => {
  it("aceita inteiros de 0 (ou do mínimo) até €1.000.000", () => {
    expect(assertCents(0)).toBe(0);
    expect(assertCents(100_000_000)).toBe(100_000_000);
    expect(assertCents(1, { min: 1 })).toBe(1);
  });
  it("rejeita negativo, decimal, texto, acima do teto e abaixo do mínimo", () => {
    for (const v of [-1, 1.5, "100", 100_000_001, NaN, null]) expect(() => assertCents(v)).toThrow("Valor inválido");
    expect(() => assertCents(0, { min: 1 })).toThrow("Valor inválido");
  });
});

describe("assertName", () => {
  it("apara espaços e corta em 40 caracteres", () => {
    expect(assertName("  Aluguel  ")).toBe("Aluguel");
    expect(assertName("x".repeat(60))).toHaveLength(40);
  });
  it("rejeita vazio e não-string", () => {
    for (const v of ["", "   ", null, 5]) expect(() => assertName(v)).toThrow("Nome inválido");
  });
});

describe("assertDueDay", () => {
  it("aceita inteiros de 1 a 31", () => {
    expect(assertDueDay(1)).toBe(1);
    expect(assertDueDay(31)).toBe(31);
  });
  it("rejeita 0, 32, decimal e texto", () => {
    for (const v of [0, 32, 1.5, "5"]) expect(() => assertDueDay(v)).toThrow("Dia inválido");
  });
});

describe("assertDeadline", () => {
  it("vazio vira null; yyyy-mm válido passa", () => {
    for (const v of [null, undefined, ""]) expect(assertDeadline(v)).toBeNull();
    expect(assertDeadline("2027-03")).toBe("2027-03");
  });
  it("rejeita mês inválido e formatos errados", () => {
    for (const v of ["2027-13", "2027-00", "2027-3", "03/2027", 2027]) expect(() => assertDeadline(v)).toThrow("Prazo inválido");
  });
});

describe("sanitizeDraft (rascunho do onboarding vindo do cliente)", () => {
  const valid = {
    weeklyLivingCents: 12000,
    bills: [{ name: "  Aluguel ", amountCents: 64000, dueDay: 1 }],
    goals: [{ name: "Viagem", targetCents: 60000, deadline: "2027-06", weeklyCents: null, isEmergency: false }],
  };

  it("normaliza: apara nomes, gera ids novos e ignora campos extras", () => {
    const d = sanitizeDraft({ ...valid, bills: [{ ...valid.bills[0], id: "hack", extra: 1 }] });
    expect(d.bills[0]).toMatchObject({ name: "Aluguel", amountCents: 64000, dueDay: 1 });
    expect(d.bills[0].id).not.toBe("hack");
    expect(d.bills[0]).not.toHaveProperty("extra");
  });

  it("meta sem valor semanal usa a sugestão do motor; prazo inválido vira null", () => {
    const d = sanitizeDraft({ ...valid, goals: [{ ...valid.goals[0], targetCents: 40000, deadline: "2027-13" }] });
    expect(d.goals[0]).toMatchObject({ deadline: null, weeklyCents: 2500, isEmergency: false });
  });

  it("limita a 30 contas e 30 metas", () => {
    const many = (n: number, mk: (i: number) => object) => Array.from({ length: n }, (_, i) => mk(i));
    const d = sanitizeDraft({
      ...valid,
      bills: many(40, () => valid.bills[0]),
      goals: many(40, () => valid.goals[0]),
    });
    expect(d.bills).toHaveLength(30);
    expect(d.goals).toHaveLength(30);
  });

  it("rejeita entrada malformada", () => {
    expect(() => sanitizeDraft(null)).toThrow("Dados inválidos");
    expect(() => sanitizeDraft({ ...valid, bills: "x" })).toThrow("Dados inválidos");
    expect(() => sanitizeDraft({ ...valid, weeklyLivingCents: -5 })).toThrow("Gasto semanal inválido");
    expect(() => sanitizeDraft({ ...valid, bills: [{ name: "", amountCents: 100, dueDay: 1 }] })).toThrow("Conta inválida");
    expect(() => sanitizeDraft({ ...valid, bills: [{ name: "X", amountCents: 100, dueDay: 40 }] })).toThrow("Conta inválida");
    expect(() => sanitizeDraft({ ...valid, goals: [{ name: "X", targetCents: 0 }] })).toThrow("Meta inválida");
  });
});
