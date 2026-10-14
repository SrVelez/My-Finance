import { euros } from "@/lib/money";
import type { EngineBill, EngineGoal, EngineState } from "@/lib/engine";

export const bill = (p: Partial<EngineBill> & Pick<EngineBill, "id" | "name" | "amountCents" | "dueDay">): EngineBill => ({
  savedCents: 0,
  paidThrough: null,
  consumedCents: 0,
  unpaidDue: null,
  createdOn: "2000-01-01",
  ...p,
});

export const goal = (p: Partial<EngineGoal> & Pick<EngineGoal, "id" | "name" | "targetCents" | "priority">): EngineGoal => ({
  savedCents: 0,
  deadline: null,
  weeklyCents: 0,
  isEmergency: false,
  ...p,
});

/** Estado base do brief com tudo zerado (prévia do onboarding). */
export const zeroState = (): EngineState => ({
  weeklyLivingCents: euros(120),
  bills: [
    bill({ id: "aluguel", name: "Aluguel", amountCents: euros(640), dueDay: 1 }),
    bill({ id: "curso", name: "Curso", amountCents: euros(125), dueDay: 10 }),
    bill({ id: "telefone", name: "Telefone", amountCents: euros(20), dueDay: 20 }),
  ],
  goals: [
    goal({ id: "visto", name: "Renovação do visto", targetCents: euros(300), deadline: "2027-02", priority: 1 }),
    goal({ id: "reserva", name: "Reserva de emergência", targetCents: euros(400), weeklyCents: euros(25), priority: 2, isEmergency: true }),
    goal({ id: "viagem", name: "Viagem", targetCents: euros(600), deadline: "2027-06", priority: 3 }),
  ],
});

/** Estado do caso 2 (8/out): contas e metas já com saldos. */
export const midCycleState = (): EngineState => {
  const s = zeroState();
  s.bills = [
    bill({ id: "aluguel", name: "Aluguel", amountCents: euros(640), dueDay: 1, savedCents: euros(320), paidThrough: "2026-10-01" }),
    // Curso pago em 10/out: novo ciclo com €0 guardado, rumo a 10/nov.
    bill({ id: "curso", name: "Curso", amountCents: euros(125), dueDay: 10, paidThrough: "2026-10-10" }),
    bill({ id: "telefone", name: "Telefone", amountCents: euros(20), dueDay: 20, savedCents: euros(15), paidThrough: "2026-09-20" }),
  ];
  s.goals[0].savedCents = euros(96);
  s.goals[1].savedCents = euros(150);
  s.goals[2].savedCents = euros(85);
  return s;
};
