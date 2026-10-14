import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getGoal } from "@/lib/services/goals";
import { serverToday } from "@/lib/services/today";
import { GoalForm } from "../../GoalForm";

export default function EditarMetaPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy />}>
      <Editar params={params} />
    </Suspense>
  );
}

async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const goal = await getGoal(id);
  if (!goal) notFound();
  return (
    <GoalForm
      minMonth={(await serverToday()).slice(0, 7)}
      goal={{
        id: goal.id,
        name: goal.name,
        targetCents: goal.targetCents,
        deadline: goal.deadline,
        weeklyCents: goal.weeklyCents,
        isEmergency: goal.isEmergency,
      }}
    />
  );
}
