import { describe, expect, it } from "vitest";
import { euros } from "@/lib/money";
import {
  deadlinePassed,
  distribute,
  nextDue,
  openDue,
  paidRecently,
  payBill,
  pendingDue,
  planBill,
  planGoal,
  settleBill,
  suggestWeekly,
} from "@/lib/engine";
import { bill, goal, zeroState } from "./fixtures";

const today = "2026-10-08";

/** Aluguel de €640 (dia 1) com o vencimento de 1/out já passado e `saved` guardado. */
const aluguelWith = (saved: number) =>
  settleBill(
    bill({
      id: "aluguel",
      name: "Aluguel",
      amountCents: euros(640),
      dueDay: 1,
      savedCents: euros(saved),
      paidThrough: "2026-09-01",
      confirmedThrough: "2026-09-01",
    }),
    today,
  );

describe("vencimento passado: fecha o ciclo e espera confirmação", () => {
  it("retém o guardado, zera o novo ciclo e fica 'a confirmar'", () => {
    const b = aluguelWith(640);
    expect(b.paidThrough).toBe("2026-10-01");
    expect(b.consumedCents).toBe(euros(640));
    expect(b.savedCents).toBe(0);
    expect(pendingDue(b)).toBe("2026-10-01");
    expect(paidRecently(b, today)).toBe(false);
    expect(nextDue(b, today)).toBe("2026-11-01");
  });

  it("o novo ciclo segue sem esperar a resposta (o motor continua separando o próximo vencimento)", () => {
    const b = aluguelWith(640);
    const plan = planBill(b, today);
    expect(plan.due).toBe("2026-11-01");
    expect(plan.amountCents).toBeGreaterThan(0);
  });

  it("conta criada depois do vencimento não fica a confirmar", () => {
    const nova = bill({ id: "n", name: "Nova", amountCents: euros(100), dueDay: 1, createdOn: "2026-10-08" });
    const settled = settleBill(nova, today);
    expect(pendingDue(settled)).toBeNull();
    expect(nextDue(settled, today)).toBe("2026-11-01");
  });
});

describe("você pagou? — paguei tudo", () => {
  it("com o valor todo guardado: nada sai do livre e a conta fecha como paga", () => {
    const p = payBill(aluguelWith(640))!;
    expect(p.paidCents).toBe(euros(640));
    expect(p.fromFreeCents).toBe(0);
    expect(p.bill.confirmedThrough).toBe("2026-10-01");
    expect(openDue(p.bill)).toBeNull();
    expect(paidRecently(p.bill, today)).toBe(true);
  });

  it("guardou menos: a diferença sai do livre da semana", () => {
    const p = payBill(aluguelWith(300))!;
    expect(p.paidCents).toBe(euros(640));
    expect(p.fromFreeCents).toBe(euros(340));
    expect(p.bill.unpaidDue).toBeNull();
  });

  it("guardou mais: a sobra vai para o próximo ciclo", () => {
    const b = { ...aluguelWith(640), consumedCents: euros(700) };
    const p = payBill(b)!;
    expect(p.fromFreeCents).toBe(0);
    expect(p.bill.savedCents).toBe(euros(60));
  });

  it("não há o que pagar quando nada está em aberto", () => {
    const b = bill({ id: "x", name: "X", amountCents: euros(10), dueDay: 1, createdOn: "2026-10-08" });
    expect(payBill(settleBill(b, today))).toBeNull();
  });
});

describe("você pagou? — outro valor / ainda não paguei", () => {
  it("pagamento parcial: o que falta vira atraso e é cobrado inteiro no próximo recebimento", () => {
    const p = payBill(aluguelWith(300), euros(400))!;
    expect(p.paidCents).toBe(euros(400));
    expect(p.fromFreeCents).toBe(euros(100)); // 400 pagos − 300 guardados
    expect(p.bill.unpaidDue).toBe("2026-10-01");
    expect(p.bill.unpaidCents).toBe(euros(240));
    const plan = planBill(p.bill, today);
    expect(plan.amountCents).toBe(euros(240));
    expect(plan.reason).toBe("Venceu em 1/out · faltam €240");
    expect(nextDue(p.bill, today)).toBe("2026-10-01");
  });

  it("'ainda não paguei': vira atraso mantendo o dinheiro guardado como parte do pagamento", () => {
    const p = payBill(aluguelWith(300), 0)!;
    expect(p.paidCents).toBe(0);
    expect(p.fromFreeCents).toBe(0);
    expect(p.bill.unpaidDue).toBe("2026-10-01");
    expect(p.bill.unpaidCents).toBe(euros(640));
    expect(p.bill.consumedCents).toBe(euros(300));
    expect(planBill(p.bill, today).amountCents).toBe(euros(340));
  });

  it("quitar o atraso depois usa o que foi guardado desde então", () => {
    const late = payBill(aluguelWith(300), 0)!.bill;
    const withMore = { ...late, consumedCents: euros(500) }; // recebimentos seguintes foram para a conta
    const p = payBill(withMore)!;
    expect(p.paidCents).toBe(euros(640));
    expect(p.fromFreeCents).toBe(euros(140));
    expect(p.bill.unpaidDue).toBeNull();
    expect(p.bill.confirmedThrough).toBe("2026-10-01");
  });

  it("não paga mais que o valor devido", () => {
    expect(payBill(aluguelWith(640), euros(9999))!.paidCents).toBe(euros(640));
  });

  it("um vencimento em atraso bloqueia fechar outro ciclo até ser resolvido", () => {
    const late = payBill(aluguelWith(300), 0)!.bill;
    expect(settleBill(late, "2026-11-20")).toBe(late);
  });
});

describe("meta com prazo vencido", () => {
  const visto = goal({ id: "v", name: "Visto", targetCents: euros(300), savedCents: euros(100), deadline: "2026-09", priority: 1 });

  it("o prazo vale até o último dia do mês", () => {
    expect(deadlinePassed("2026-10", "2026-10-31")).toBe(false);
    expect(deadlinePassed("2026-10", "2026-11-01")).toBe(true);
  });

  it("pausa em vez de cobrar tudo de uma vez", () => {
    const plan = planGoal(visto, today);
    expect(plan.amountCents).toBe(0);
    expect(plan.reason).toBe("Prazo de set/2026 venceu · escolha o que fazer");
  });

  it("na distribuição, o dinheiro não é engolido por uma meta vencida", () => {
    const state = zeroState();
    state.goals = [visto];
    const d = distribute({ incomeCents: euros(500), date: today, state, assumeFreshCycle: true });
    expect(d.goalsCents).toBe(0);
    expect(d.allocations.find((a) => a.id === "v")?.reason).toContain("venceu");
  });
});

describe("extras", () => {
  it("sugestão de valor semanal sem prazo (~16 semanas)", () => {
    expect(suggestWeekly(euros(400))).toBe(euros(25));
  });

  it("dinheiro insuficiente para as contas: cobre na ordem e zera o resto", () => {
    const d = distribute({ incomeCents: euros(100), date: today, state: zeroState(), assumeFreshCycle: true });
    expect(d.allocations.find((a) => a.id === "aluguel")?.amountCents).toBe(euros(100));
    expect(d.allocations.find((a) => a.id === "curso")?.amountCents).toBe(0);
    expect(d.livingCents).toBe(0);
    expect(d.shortfallCents).toBe(euros(120));
  });
});
