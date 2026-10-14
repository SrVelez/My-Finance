import { Suspense } from "react";
import { ReceberFlow } from "./ReceberFlow";

export default function ReceberPage() {
  // A data de hoje é lida no render do cliente: fica fora do shell estático.
  return (
    <Suspense fallback={<div className="flex-1" aria-busy />}>
      <ReceberFlow />
    </Suspense>
  );
}
