"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/Button";
import type { DraftGoal } from "@/lib/draft";
import { formatMonthYear } from "@/lib/engine";
import { formatEUR } from "@/lib/money";
import { Shell } from "./Shell";
import type { StepProps } from "./OnboardingFlow";

function SortableGoal({ goal, index }: { goal: DraftGoal; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: goal.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-card border bg-surface px-4 py-3 ${
        isDragging ? "relative z-10 border-2 border-brand shadow-lg" : "border-line"
      }`}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{goal.name}</span>
        <span className="block text-xs text-muted">
          {formatEUR(goal.targetCents)} · {goal.deadline ? `até ${formatMonthYear(goal.deadline)}` : "sem prazo"}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Arrastar ${goal.name}`}
        className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center text-xl text-muted"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
    </li>
  );
}

export function StepPriorities({ draft, update, go }: StepProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    update((d) => {
      const from = d.goals.findIndex((g) => g.id === active.id);
      const to = d.goals.findIndex((g) => g.id === over.id);
      return { ...d, goals: arrayMove(d.goals, from, to) };
    });
  };

  const billsTotal = draft.bills.reduce((s, b) => s + b.amountCents, 0);
  const billNames = draft.bills.map((b) => b.name.toLowerCase());
  const billsLabel =
    billNames.length > 1 ? `${billNames.slice(0, -1).join(", ")} e ${billNames.at(-1)}` : (billNames[0] ?? "Nenhuma conta");

  return (
    <Shell
      step={3}
      onBack={() => go(2)}
      title="O que é mais importante para você?"
      subtitle="Arraste para ordenar. O que está no topo recebe dinheiro primeiro."
      footer={<Button onClick={() => go(4)}>Continuar</Button>}
    >
      <section>
        <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-muted">SEMPRE PRIMEIRO</h2>
        <div className="divide-y divide-line overflow-hidden rounded-card bg-locked">
          <LockedRow title="Contas fixas" detail={billsLabel} value={`${formatEUR(billsTotal)}/mês`} />
          <LockedRow title="Gasto da semana" detail="Mercado e transporte" value={`${formatEUR(draft.weeklyLivingCents)}/sem`} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-muted">SUAS METAS</h2>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={draft.goals.map((g) => g.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2.5">
              {draft.goals.map((g, i) => (
                <SortableGoal key={g.id} goal={g} index={i} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </section>

      <p role="note" className="rounded-card bg-warn-bg p-4 text-sm text-warn-ink">
        Se o dinheiro da semana não der para tudo, as últimas da lista recebem menos. Você sempre vê o motivo.
      </p>
    </Shell>
  );
}

function LockedRow({ title, detail, value }: { title: string; detail: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <svg aria-hidden viewBox="0 0 24 24" className="size-4 shrink-0 fill-none stroke-muted" strokeWidth={2}>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted first-letter:uppercase">{detail}</span>
      </span>
      <span className="font-extrabold">{value}</span>
    </div>
  );
}
