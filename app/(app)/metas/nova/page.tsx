import { Suspense } from "react";
import { serverToday } from "@/lib/services/today";
import { GoalForm } from "../GoalForm";

export default function NovaMetaPage() {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy />}>
      <Nova />
    </Suspense>
  );
}

async function Nova() {
  return <GoalForm minMonth={(await serverToday()).slice(0, 7)} />;
}
