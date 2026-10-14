import { formatEUR, type Cents } from "@/lib/money";

/** Linha mínima de transação que o extrato precisa (independe do Prisma). */
export interface StatementRow {
  id: string;
  type: string;
  amountCents: Cents;
  category: string | null;
  /** Dia da movimentação (`yyyy-mm-dd`). */
  date: string;
  note: string | null;
  groupId: string | null;
  billId: string | null;
  goalId: string | null;
  /** Nomes atuais, quando a conta/meta ainda existe. */
  billName: string | null;
  goalName: string | null;
  createdAt: number;
}

/** Uma linha de "para onde foi o dinheiro" dentro de um recebimento. */
export interface StatementLine {
  kind: "bill" | "goal" | "reserve" | "free";
  label: string;
  detail: string;
  /** Sempre positivo; o sinal vem do `kind`. */
  amountCents: Cents;
}

export type StatementEntry =
  | {
      kind: "income";
      id: string;
      date: string;
      amountCents: Cents;
      /** Divisão do dinheiro; vazia em recebimentos antigos sem agrupamento. */
      lines: StatementLine[];
    }
  | { kind: "expense"; id: string; date: string; amountCents: Cents; category: string; detail: string }
  /** Alocação/retirada solta (sem recebimento associado). */
  | { kind: "movement"; id: string; date: string; amountCents: Cents; label: string; detail: string; sign: 1 | -1 };

const nameOf = (r: StatementRow, fallback: string) => r.billName ?? r.goalName ?? r.note ?? fallback;

/**
 * Monta o extrato: despesas, recebimentos (com a divisão do valor entre contas,
 * metas e livre) e movimentações soltas, do mais recente para o mais antigo.
 */
export function buildStatement(rows: StatementRow[]): StatementEntry[] {
  const children = new Map<string, StatementRow[]>();
  for (const r of rows) {
    if (r.groupId && r.type !== "income") children.set(r.groupId, [...(children.get(r.groupId) ?? []), r]);
  }

  const entries: { sortKey: [string, number]; entry: StatementEntry }[] = [];

  for (const r of rows) {
    const key: [string, number] = [r.date, r.createdAt];
    if (r.type === "expense") {
      // "Conta" = parte de um pagamento de conta que não estava guardada (saiu do livre).
      const billShare = r.category === "Conta";
      entries.push({
        sortKey: key,
        entry: {
          kind: "expense",
          id: r.id,
          date: r.date,
          amountCents: r.amountCents,
          category: billShare ? (r.billName ?? r.note ?? "Conta") : (r.category ?? "Outro"),
          detail: billShare ? "Pagamento de conta · parte que não estava guardada" : "Gasto do dia a dia",
        },
      });
    } else if (r.type === "income") {
      const kids = r.groupId ? (children.get(r.groupId) ?? []) : [];
      const lines: StatementLine[] = [];
      let saved = 0;
      let withdrawn = 0;
      for (const k of kids) {
        if (k.type === "allocation") {
          saved += k.amountCents;
          lines.push(
            k.billId || k.billName || k.category === "conta"
              ? { kind: "bill", label: nameOf(k, "Conta removida"), detail: "Guardado para a conta", amountCents: k.amountCents }
              : { kind: "goal", label: nameOf(k, "Meta removida"), detail: "Guardado na meta", amountCents: k.amountCents },
          );
        } else if (k.type === "withdrawal") {
          withdrawn += k.amountCents;
          lines.push({ kind: "reserve", label: nameOf(k, "Reserva de emergência"), detail: "Retirado para completar o dia a dia", amountCents: k.amountCents });
        }
      }
      if (kids.length > 0) {
        lines.push({ kind: "free", label: "Livre para gastar", detail: "Dia a dia + folga da semana", amountCents: r.amountCents - saved + withdrawn });
      }
      entries.push({ sortKey: key, entry: { kind: "income", id: r.id, date: r.date, amountCents: r.amountCents, lines } });
    } else if ((r.type === "allocation" || r.type === "withdrawal") && !r.groupId) {
      const withdrawal = r.type === "withdrawal";
      entries.push({
        sortKey: key,
        entry: {
          kind: "movement",
          id: r.id,
          date: r.date,
          amountCents: r.amountCents,
          label: nameOf(r, "Removida"),
          detail: r.category === "manual"
            ? withdrawal
              ? "Retirado por você · voltou para o livre"
              : "Guardado por você · saiu do livre"
            : withdrawal
              ? "Retirado da meta"
              : "Guardado",
          sign: withdrawal ? 1 : -1,
        },
      });
    }
  }

  return entries
    .sort((a, b) => b.sortKey[0].localeCompare(a.sortKey[0]) || b.sortKey[1] - a.sortKey[1])
    .map((e) => e.entry);
}

// ---------------------------------------------------------------------------
// Extrato de uma conta ou meta (agrupado por data)
// ---------------------------------------------------------------------------

export interface HistoryItem {
  id: string;
  date: string;
  label: string;
  detail: string;
  amountCents: Cents;
  /** +1 entrou na conta/meta, −1 saiu. */
  sign: 1 | -1;
  /** Só informativo (ex.: conta marcada como não paga): sem sinal nem cor. */
  neutral?: boolean;
  createdAt: number;
}

export interface HistoryDay {
  date: string;
  items: HistoryItem[];
}

/** Linha de transação ligada a uma conta ou meta. */
export interface ItemTxRow {
  id: string;
  type: string;
  amountCents: Cents;
  date: string;
  groupId: string | null;
  createdAt: number;
  /** Movido à mão pelo usuário (Guardar/Retirar), não por um recebimento. */
  manual?: boolean;
}

const origin = (row: ItemTxRow, incomeByGroup: Map<string, Cents>) => {
  if (row.manual) return "Guardado por você · saiu do livre";
  const income = row.groupId ? incomeByGroup.get(row.groupId) : undefined;
  return income ? `Do recebimento de ${formatEUR(income)}` : "De um recebimento";
};

/**
 * Extrato de uma conta: guardado a cada recebimento (ou à mão), retiradas
 * e os pagamentos confirmados em cada vencimento.
 */
export function billHistory(rows: ItemTxRow[], incomeByGroup: Map<string, Cents>): HistoryItem[] {
  return rows.flatMap((r): HistoryItem[] => {
    const base = { id: r.id, date: r.date, amountCents: r.amountCents, createdAt: r.createdAt };
    if (r.type === "allocation") {
      return [{ ...base, label: "Guardado para a conta", detail: origin(r, incomeByGroup), sign: 1 }];
    }
    if (r.type === "withdrawal") {
      return [{ ...base, label: "Retirado da conta", detail: "Retirado por você · voltou para o livre", sign: -1 }];
    }
    if (r.type === "bill_payment") {
      return [{ ...base, label: "Vencimento pago", detail: "Pagamento confirmado por você", sign: -1 }];
    }
    return [];
  });
}

/** Extrato de uma meta: guardado a cada recebimento e retiradas (reserva). */
export function goalHistory(rows: ItemTxRow[], incomeByGroup: Map<string, Cents>): HistoryItem[] {
  return rows.flatMap((r): HistoryItem[] => {
    if (r.type === "allocation") {
      return [{ id: r.id, date: r.date, label: "Guardado na meta", detail: origin(r, incomeByGroup), amountCents: r.amountCents, sign: 1, createdAt: r.createdAt }];
    }
    if (r.type === "withdrawal") {
      return [
        {
          id: r.id,
          date: r.date,
          label: "Retirado da meta",
          detail: r.manual ? "Retirado por você · voltou para o livre" : "Usado para completar o dia a dia",
          amountCents: r.amountCents,
          sign: -1,
          createdAt: r.createdAt,
        },
      ];
    }
    return [];
  });
}

/** Agrupa por data (mais recente primeiro); dentro do dia, o criado depois vem antes. */
export function groupByDate(items: HistoryItem[]): HistoryDay[] {
  const days = new Map<string, HistoryItem[]>();
  for (const item of items) days.set(item.date, [...(days.get(item.date) ?? []), item]);
  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => ({ date, items: list.sort((x, y) => y.createdAt - x.createdAt) }));
}
