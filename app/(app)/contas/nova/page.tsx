import { Suspense } from "react";
import { serverToday } from "@/lib/services/today";
import { BillForm } from "../BillForm";

export default function NovaContaPage() {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy />}>
      <Nova />
    </Suspense>
  );
}

async function Nova() {
  return <BillForm today={await serverToday()} />;
}
