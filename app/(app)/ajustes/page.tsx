import { Suspense } from "react";
import { getOrCreateUser } from "@/lib/services/user";
import { SettingsForm } from "./SettingsForm";

export default function AjustesPage() {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy />}>
      <Ajustes />
    </Suspense>
  );
}

async function Ajustes() {
  const user = await getOrCreateUser();
  return (
    <SettingsForm
      initial={{ name: user.name, weeklyLivingCents: user.weeklyLivingCents, weekStartDay: user.weekStartDay }}
    />
  );
}
