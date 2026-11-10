import { describe, expect, it } from "vitest";
import { buildDashboard } from "@/lib/dashboard";
import { buildMetas } from "@/lib/dashboard/metas";
import {
  checkAdjustment,
  checkBillOpening,
  checkGoalOpening,
  distribute,
  planBill,
  planGoal,
  settleBill,
  weekPool,
  weekTxsOf,
} from "@/lib/engine";
import { euros, formatEUR } from "@/lib/money";
import { bill, goal, zeroState } from "./engine/fixtures";
import { recebimento, seedTxs } from "./dashboard/fixtures";

const TODAY = "2026-11-10"; // terça-feira

describe("saldo inicial de meta (casos 1 e 2)", () => {
  const viagem = goal({ id: "v", name: "Viagem", targetCents: euros(600), deadline: "2027-06", priority: 1 });

  it("1. Viagem €600 até jun/2027 com €200: 33% e valor semanal menor que o de começar do zero", () => {
    const comSaldo = planGoal({ ...viagem, savedCents: euros(200) }, TODAY);
    const doZero = planGoal(viagem, TODAY);
    // €400 faltantes ÷ 31 semanas, contra €600 ÷ 31.
    expect(comSaldo.amountCents).toBe(euros(13));
    expect(doZero.amountCents).toBe(euros(19));
    expect(comSaldo.amountCents).toBeLessThan(doZero.amountCents);
    expect(Math.round((euros(200) / euros(600)) * 100)).toBe(33);
    expect(comSaldo.reason).toBe(`Faltam ${formatEUR(euros(400))} até jun/2027`);
  });

  it("2. meta já completa: recebe €0 na distribuição", () => {
    const visto = goal({ id: "visto", name: "Renovação do visto", targetCents: euros(300), savedCents: euros(300), deadline: "2027-02", priority: 1 });
    expect(planGoal(visto, TODAY)).toEqual({ amountCents: 0, reason: "Meta completa" });
    const state = { weeklyLivingCents: euros(120), bills: [], goals: [visto] };
    expect(distribute({ incomeCents: euros(500), date: TODAY, state }).goalsCents).toBe(0);
  });

  it("saldo acima do alvo é aceito e já conclui a meta; negativo é bloqueado", () => {
    expect(checkGoalOpening(euros(350), euros(300))).toEqual({ ok: true, savedCents: euros(350), completes: true });
    expect(checkGoalOpening(euros(100), euros(300))).toEqual({ ok: true, savedCents: euros(100), completes: false });
    expect(checkGoalOpening(-1, euros(300)).ok).toBe(false);
    expect(checkGoalOpening(1.5, euros(300)).ok).toBe(false);
  });
});

describe("saldo inicial de conta (casos 3 a 5)", () => {
  it("3. Aluguel €640 (dia 1) com €200: falta €440 até 1/dez, dividida em 3 recebimentos", () => {
    const aluguel = bill({ id: "a", name: "Aluguel", amountCents: euros(640), dueDay: 1, savedCents: euros(200), createdOn: TODAY });
    const plan = planBill(settleBill(aluguel, TODAY), TODAY);
    expect(plan.reason).toBe("Faltam €440 até 1/dez, em 3 pagamentos");
    expect(plan.payments).toBe(3);
    expect(plan.amountCents).toBe(euros(147)); // €440 ÷ 3, não €640 ÷ 4
    expect(planBill(settleBill({ ...aluguel, savedCents: 0 }, TODAY), TODAY).amountCents).toBe(euros(160));
  });

  it("5. saldo de €700 numa conta de €640 é rejeitado; até o valor da conta passa", () => {
    expect(checkBillOpening({ mode: "partial", cents: euros(700) }, euros(640), 1, TODAY)).toEqual({
      ok: false,
      error: "O valor guardado não pode passar de €640.",
    });
    expect(checkBillOpening({ mode: "partial", cents: euros(640) }, euros(640), 1, TODAY)).toMatchObject({ ok: true });
    expect(checkBillOpening({ mode: "partial", cents: -5 }, euros(640), 1, TODAY).ok).toBe(false);
  });

  it("4. 'já paguei este mês' só vale se o vencimento deste mês já passou ou é hoje", () => {
    expect(checkBillOpening({ mode: "paid" }, euros(125), 10, TODAY)).toEqual({ ok: true, savedCents: 0, paidBefore: true });
    expect(checkBillOpening({ mode: "paid" }, euros(125), 1, TODAY)).toMatchObject({ ok: true }); // dia 1 já passou
    expect(checkBillOpening({ mode: "paid" }, euros(125), 20, TODAY).ok).toBe(false); // dia 20 ainda não
  });
});

describe("checkAdjustment", () => {
  const base = { haveCents: euros(150), freeLeftCents: euros(50) };

  it("zerar sem mexer no livre", () => {
    expect(checkAdjustment({ ...base, newBalanceCents: 0, reason: "reset" })).toEqual({ ok: true, deltaCents: -euros(150), affectsWeeklyFree: false });
  });
  it("devolver ao livre mexe no livre; 'usado' e 'bater com o banco' não", () => {
    expect(checkAdjustment({ ...base, newBalanceCents: euros(100), reason: "return_to_free" })).toMatchObject({ ok: true, affectsWeeklyFree: true });
    expect(checkAdjustment({ ...base, newBalanceCents: euros(100), reason: "used" })).toMatchObject({ ok: true, affectsWeeklyFree: false });
    expect(checkAdjustment({ ...base, newBalanceCents: euros(100), reason: "match_bank" })).toMatchObject({ ok: true, affectsWeeklyFree: false });
  });
  it("8. aumentar tirando do livre sem livre suficiente é bloqueado, com o valor disponível", () => {
    expect(checkAdjustment({ ...base, newBalanceCents: euros(230), reason: "from_free" })).toEqual({
      ok: false,
      error: "Você só tem €50 livres esta semana.",
    });
    expect(checkAdjustment({ ...base, newBalanceCents: euros(200), reason: "from_free" })).toMatchObject({ ok: true, affectsWeeklyFree: true });
  });
  it("rejeita motivo incompatível, saldo igual, negativo, decimal e acima do teto da conta", () => {
    expect(checkAdjustment({ ...base, newBalanceCents: euros(100), reason: "from_free" }).ok).toBe(false);
    expect(checkAdjustment({ ...base, newBalanceCents: euros(200), reason: "used" }).ok).toBe(false);
    expect(checkAdjustment({ ...base, newBalanceCents: euros(150), reason: "match_bank" })).toEqual({ ok: false, error: "O saldo já é €150." });
    expect(checkAdjustment({ ...base, newBalanceCents: euros(10), reason: "reset" }).ok).toBe(false);
    for (const v of [-1, 1.5]) expect(checkAdjustment({ ...base, newBalanceCents: v, reason: "match_bank" }).ok).toBe(false);
    expect(checkAdjustment({ ...base, newBalanceCents: euros(700), reason: "match_bank", maxCents: euros(640) })).toEqual({
      ok: false,
      error: "O valor guardado não pode passar de €640.",
    });
  });
});

describe("weekTxsOf: o livre da semana com ajustes", () => {
  const semana = [
    { type: "income", amountCents: euros(500) },
    { type: "allocation", amountCents: euros(250) },
  ];
  const pool = (extra: object[]) => weekPool(weekTxsOf([...semana, ...extra] as never));

  it("saldo inicial e ajuste que não afeta o livre não mudam nada", () => {
    expect(pool([])).toBe(euros(250));
    expect(pool([{ type: "opening_balance", amountCents: euros(200) }])).toBe(euros(250));
    expect(pool([{ type: "adjustment", amountCents: -euros(150), affectsWeeklyFree: false }])).toBe(euros(250));
  });
  it("7. devolver ao livre soma; tirar do livre subtrai", () => {
    expect(pool([{ type: "adjustment", amountCents: -euros(50), affectsWeeklyFree: true }])).toBe(euros(300));
    expect(pool([{ type: "adjustment", amountCents: euros(80), affectsWeeklyFree: true }])).toBe(euros(170));
  });
  it("9. ajuste desfeito não conta", () => {
    expect(pool([{ type: "adjustment", amountCents: -euros(50), affectsWeeklyFree: true, undoneAt: new Date() }])).toBe(euros(250));
  });
});

describe("dashboard", () => {
  const base = { periodo: "3meses" as const, today: "2026-10-22", weekStartDay: 1, weeklyLivingCents: euros(120), goals: [], bills: [] };
  const extras = [
    { id: "o", type: "opening_balance", amountCents: euros(200), category: null, date: "2026-10-01", groupId: null, shortfallCents: null, note: null },
    { id: "a", type: "adjustment", amountCents: -euros(150), category: null, date: "2026-10-02", groupId: null, shortfallCents: null, note: null, reason: "reset" },
  ];

  it("10. saldo inicial e ajuste não entram em Recebido, Guardado % nem nos recebimentos", () => {
    const sem = buildDashboard({ ...base, txs: seedTxs() });
    const com = buildDashboard({ ...base, txs: [...seedTxs(), ...extras] });
    expect(com.destaques).toEqual(sem.destaques);
    expect(com.recebimentos).toEqual(sem.recebimentos);
  });

  it("o ritmo da semana enxerga o ajuste que devolve ao livre", () => {
    const semana = recebimento("2026-10-20", euros(500));
    const devolve = { id: "d", type: "adjustment", amountCents: -euros(50), category: null, date: "2026-10-21", groupId: null, shortfallCents: null, note: null, affectsWeeklyFree: true };
    const sem = buildDashboard({ ...base, periodo: "semana", today: "2026-10-22", txs: semana });
    const com = buildDashboard({ ...base, periodo: "semana", today: "2026-10-22", txs: [...semana, devolve] });
    expect(com.ritmoSemana?.livreCents).toBe((sem.ritmoSemana?.livreCents ?? 0) + euros(50));
  });

  it("11. meta com saldo inicial de €200/€600: o esperado começa em 33%, não em 0%", () => {
    const viagem = { id: "v", name: "Viagem", targetCents: euros(600), savedCents: euros(200), deadline: "2027-06", weeklyCents: 0, priority: 1, createdOn: TODAY };
    const [naCriacao] = buildMetas([{ ...viagem, baseline: { cents: euros(200), date: TODAY } }], TODAY);
    expect(naCriacao).toMatchObject({ pct: 33, esperadoPct: 33, status: "no_ritmo" });
    const [semBase] = buildMetas([viagem], TODAY);
    expect(semBase.esperadoPct).toBe(0);
  });

  it("depois de um ajuste, o marcador parte do novo saldo e da data do ajuste", () => {
    const reserva = { id: "r", name: "Reserva", targetCents: euros(400), savedCents: 0, deadline: "2027-03", weeklyCents: 0, priority: 1, createdOn: "2026-08-01" };
    const antes = buildMetas([reserva], "2026-11-10")[0];
    const zerada = buildMetas([{ ...reserva, baseline: { cents: 0, date: "2026-11-10" } }], "2026-11-10")[0];
    expect(antes.esperadoPct ?? 0).toBeGreaterThan(30);
    expect(zerada.esperadoPct).toBe(0);
    expect(zerada.status).toBe("no_ritmo");
  });
});

describe("estado base", () => {
  it("o motor não mudou: distribuição do estado base continua igual", () => {
    const d = distribute({ incomeCents: euros(500), date: "2026-10-08", state: zeroState(), assumeFreshCycle: true });
    expect(d.toSaveCents + d.livingCents + d.slackCents).toBe(euros(500));
  });
});
