import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getBill } from "@/lib/services/bills";
import { BillForm } from "../../BillForm";

export default function EditarContaPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy />}>
      <Editar params={params} />
    </Suspense>
  );
}

async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bill = await getBill(id);
  if (!bill) notFound();
  return <BillForm bill={{ id: bill.id, name: bill.name, amountCents: bill.amountCents, dueDay: bill.dueDay }} />;
}
