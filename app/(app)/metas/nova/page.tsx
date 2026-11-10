import { Suspense } from "react";
import { requirePageUser } from "@/lib/auth/session";
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
  await requirePageUser();
  return <GoalForm minMonth={(await serverToday()).slice(0, 7)} />;
}
