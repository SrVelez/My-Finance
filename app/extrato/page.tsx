import { Suspense } from "react";
import { FlowHeader } from "@/components/FlowHeader";
import { StatementList } from "@/components/StatementList";
import { requirePageUser } from "@/lib/auth/session";
import { getStatement } from "@/lib/services/statement";
import { serverToday } from "@/lib/services/today";

export default function ExtratoPage() {
  return (
    <div className="flex flex-1 flex-col">
      <FlowHeader title="Extrato" />
      <Suspense fallback={<main className="flex-1" aria-busy />}>
        <Extrato />
      </Suspense>
    </div>
  );
}

async function Extrato() {
  const today = await serverToday();
  const { userId } = await requirePageUser();
  const entries = await getStatement(userId, 200);
  return (
    <main className="flex-1 px-5 pt-4 pb-8">
      <StatementList entries={entries} today={today} />
    </main>
  );
}
