import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { getUser } from "@/lib/services/user";
import { SettingsForm } from "./SettingsForm";

export default function AjustesPage() {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy />}>
      <Ajustes />
    </Suspense>
  );
}

async function Ajustes() {
  const { userId } = await requireUser();
  const user = await getUser(userId);
  return (
    <SettingsForm
      initial={{ name: user.name, weeklyLivingCents: user.weeklyLivingCents, weekStartDay: user.weekStartDay }}
    />
  );
}
