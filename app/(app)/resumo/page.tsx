import { Suspense } from "react";
import { requirePageUser } from "@/lib/auth/session";
import { ResumoView } from "./ResumoView";

export default function ResumoPage() {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy />}>
      <Resumo />
    </Suspense>
  );
}

async function Resumo() {
  await requirePageUser();
  return <ResumoView />;
}
