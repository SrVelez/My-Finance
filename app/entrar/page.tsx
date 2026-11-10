import { Suspense } from "react";
import { getOptionalUser } from "@/lib/auth/session";
import { enabledProviders } from "@/lib/auth/providers";
import { EntrarFlow } from "./EntrarFlow";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * "Salve seu plano" (vindo do onboarding) e "Entrar" (quem já tem conta): a mesma tela, título
 * diferente. Quem já está logado só passa por aqui para gravar o rascunho na conta.
 */
export default function EntrarPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy />}>
      <Entrar searchParams={searchParams} />
    </Suspense>
  );
}

async function Entrar({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const me = await getOptionalUser();
  return <EntrarFlow loggedIn={!!me} plano={sp.etapa === "plano"} voltouDoLogin={sp.novo === "1"} providers={enabledProviders} />;
}
