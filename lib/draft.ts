import { euros, type Cents } from "@/lib/money";
import { suggestWeekly, type EngineState } from "@/lib/engine";

export interface DraftBill {
  id: string;
  /** Nome do chip de sugestão que originou a conta (ausente em "Outra"). */
  preset?: string;
  name: string;
  amountCents: Cents;
  dueDay: number;
}

export interface DraftGoal {
  id: string;
  preset?: string;
  name: string;
  targetCents: Cents;
  /** `yyyy-mm` ou null (sem prazo). */
  deadline: string | null;
  /** Valor semanal escolhido; null = usar a sugestão. */
  weeklyCents: Cents | null;
  isEmergency: boolean;
}

export interface OnboardingDraft {
  weeklyLivingCents: Cents;
  bills: DraftBill[];
  goals: DraftGoal[];
}

export const BILL_PRESETS: { name: string; amountCents: Cents; dueDay: number }[] = [
  { name: "Aluguel", amountCents: euros(640), dueDay: 1 },
  { name: "Curso", amountCents: euros(125), dueDay: 10 },
  { name: "Telefone", amountCents: euros(20), dueDay: 20 },
  { name: "Academia", amountCents: euros(40), dueDay: 5 },
  { name: "Internet", amountCents: euros(40), dueDay: 15 },
  { name: "Transporte", amountCents: euros(50), dueDay: 1 },
  { name: "Streaming", amountCents: euros(15), dueDay: 12 },
];

export const GOAL_PRESETS: { name: string; targetCents: Cents; isEmergency?: boolean }[] = [
  { name: "Reserva de emergência", targetCents: euros(400), isEmergency: true },
  { name: "Renovação do visto", targetCents: euros(300) },
  { name: "Viagem", targetCents: euros(600) },
  { name: "Mandar para o Brasil", targetCents: euros(500) },
  { name: "Quitar dívida", targetCents: euros(1000) },
];

export const effectiveWeekly = (g: DraftGoal): Cents => g.weeklyCents ?? suggestWeekly(g.targetCents);

export const newId = () => Math.random().toString(36).slice(2, 10);

export function toEngineState(draft: OnboardingDraft, today: string): EngineState {
  return {
    weeklyLivingCents: draft.weeklyLivingCents,
    bills: draft.bills.map((b) => ({
      id: b.id,
      name: b.name,
      amountCents: b.amountCents,
      dueDay: b.dueDay,
      savedCents: 0,
      paidThrough: null,
      consumedCents: 0,
      unpaidDue: null,
      unpaidCents: 0,
      confirmedThrough: null,
      createdOn: today,
    })),
    goals: draft.goals.map((g, i) => ({
      id: g.id,
      name: g.name,
      targetCents: g.targetCents,
      savedCents: 0,
      deadline: g.deadline,
      weeklyCents: g.deadline ? 0 : effectiveWeekly(g),
      priority: i + 1,
      isEmergency: g.isEmergency,
    })),
  };
}

const isInt = (n: unknown, min: number, max: number): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

/** Valida o rascunho vindo do cliente (Server Actions são alcançáveis por POST direto). */
export function sanitizeDraft(input: unknown): OnboardingDraft {
  const raw = input as Partial<OnboardingDraft> | null;
  if (!raw || !Array.isArray(raw.bills) || !Array.isArray(raw.goals)) throw new Error("Dados inválidos");
  const MAX = 100_000_000;
  if (!isInt(raw.weeklyLivingCents, 0, MAX)) throw new Error("Gasto semanal inválido");

  const bills = raw.bills.slice(0, 30).map((b: DraftBill) => {
    const name = String(b.name ?? "").trim().slice(0, 40);
    if (!name || !isInt(b.amountCents, 1, MAX) || !isInt(b.dueDay, 1, 31)) throw new Error("Conta inválida");
    return { id: newId(), name, amountCents: b.amountCents, dueDay: b.dueDay };
  });

  const goals = raw.goals.slice(0, 30).map((g: DraftGoal) => {
    const name = String(g.name ?? "").trim().slice(0, 40);
    const deadline = g.deadline && /^\d{4}-(0[1-9]|1[0-2])$/.test(g.deadline) ? g.deadline : null;
    const weekly = g.weeklyCents ?? suggestWeekly(Number(g.targetCents));
    if (!name || !isInt(g.targetCents, 1, MAX) || !isInt(weekly, 0, MAX)) throw new Error("Meta inválida");
    return {
      id: newId(),
      name,
      targetCents: g.targetCents,
      deadline,
      weeklyCents: weekly,
      isEmergency: g.isEmergency === true,
    };
  });

  return { weeklyLivingCents: raw.weeklyLivingCents, bills, goals };
}
