import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getOptionalUser } from "@/lib/auth/session";

/**
 * Boas-vindas: a primeira tela de quem não está logado. É a mesma que o proxy mostra em `/`
 * (a URL continua `/`). O app mostra o valor ANTES de pedir cadastro: "Começar" vai direto ao
 * onboarding, sem login.
 */
export default function BemVindoPage() {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy />}>
      <BemVindo />
    </Suspense>
  );
}

async function BemVindo() {
  if (await getOptionalUser()) redirect("/");
  return (
    <main className="flex flex-1 flex-col justify-between px-6 pt-16 pb-8">
      <div>
        <p className="font-display text-xl font-extrabold text-brand">Finança</p>
        <h1 className="mt-10 font-display text-[40px] leading-[1.05] font-extrabold">Você recebe. O Finança diz quanto separar.</h1>
        <p className="mt-4 text-[15px] text-muted">
          Conte suas contas fixas e metas, e veja em segundos quanto sobra livre para gastar esta semana. Sem cadastro para começar.
        </p>
      </div>

      <div className="space-y-2">
        <Link href="/onboarding" className="flex min-h-12 w-full items-center justify-center rounded-xl bg-brand text-base font-bold text-white">
          Começar
        </Link>
        <Link href="/entrar" className="flex min-h-12 w-full items-center justify-center text-sm font-semibold text-brand">
          Já tenho conta
        </Link>
      </div>
    </main>
  );
}
