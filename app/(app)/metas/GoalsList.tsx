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
import Link from "next/link";
import { useState, useTransition } from "react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { goalStatus } from "@/lib/goalStatus";
import { formatEUR } from "@/lib/money";
import type { GoalView } from "@/lib/services/goals";
import { reorderGoalsAction } from "./actions";

function GoalCard({ goal, reordering }: { goal: GoalView; reordering: boolean }) {
  const pct = goal.targetCents > 0 ? Math.round((goal.savedCents / goal.targetCents) * 100) : 0;
  const st = goalStatus(goal);
  const body = (
    <>
      <span className="flex items-center gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
          {goal.priority}
        </span>
        <span className="flex-1 font-semibold">{goal.name}</span>
        <span className="text-xs text-muted">{pct}%</span>
      </span>
      <ProgressBar label={`Progresso de ${goal.name}`} value={goal.savedCents} max={goal.targetCents} />
      <span className="flex justify-between text-xs">
        <span className="text-muted">
          {formatEUR(goal.savedCents)} de {formatEUR(goal.targetCents)}
        </span>
        {goal.weeklyCents > 0 && <span className="text-muted">{formatEUR(goal.weeklyCents)}/semana</span>}
      </span>
      <span className={`block text-xs ${st.tone}`}>{st.text}</span>
    </>
  );
  return reordering ? (
    <div className="flex-1 space-y-2">{body}</div>
  ) : (
    <Link href={`/metas/${goal.id}`} className="block space-y-2">
      {body}
    </Link>
  );
}

function SortableCard({ goal }: { goal: GoalView }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: goal.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-card border bg-surface p-4 ${
        isDragging ? "relative z-10 border-2 border-brand shadow-lg" : "border-line"
      }`}
    >
      <GoalCard goal={goal} reordering />
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

export function GoalsList({ goals }: { goals: GoalView[] }) {
  const [reordering, setReordering] = useState(false);
  const [order, setOrder] = useState(goals);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setOrder((list) => {
      const from = list.findIndex((g) => g.id === active.id);
      const to = list.findIndex((g) => g.id === over.id);
      return arrayMove(list, from, to).map((g, i) => ({ ...g, priority: i + 1 }));
    });
  };

  const finish = () =>
    startTransition(async () => {
      setError(null);
      try {
        await reorderGoalsAction(order.map((g) => g.id));
        setReordering(false);
      } catch {
        setError("Não foi possível salvar a ordem. Tente de novo.");
      }
    });

  const list = reordering ? order : goals;

  return (
    <>
      {goals.length > 1 && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={pending}
            onClick={() => (reordering ? finish() : (setOrder(goals), setReordering(true)))}
            className="min-h-11 rounded-lg border border-line bg-surface px-3 text-xs font-semibold"
          >
            {reordering ? (pending ? "Salvando…" : "Concluir") : "⇅ Reordenar"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-warn-ink">
          {error}
        </p>
      )}

      {reordering ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={list.map((g) => g.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-3">
              {list.map((g) => (
                <SortableCard key={g.id} goal={g} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <ul className="space-y-3">
          {list.map((g) => (
            <li key={g.id} className="rounded-card border border-line bg-surface p-4">
              <GoalCard goal={g} reordering={false} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
