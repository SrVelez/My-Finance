import { Suspense } from "react";
import { requirePageUser } from "@/lib/auth/session";
import { getHomeData } from "@/lib/services/home";
import { serverToday } from "@/lib/services/today";
import { GastarFlow } from "./GastarFlow";

export default function GastarPage() {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy />}>
      <GastarLoader />
    </Suspense>
  );
}

async function GastarLoader() {
  const { userId } = await requirePageUser();
  const { freeLeftCents } = await getHomeData(userId, await serverToday());
  return <GastarFlow freeLeftCents={freeLeftCents} />;
}
