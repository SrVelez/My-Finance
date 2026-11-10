import Link from "next/link";

export const metadata = { title: "Política de Privacidade · Finança" };

/** RASCUNHO: texto provisório, a ser revisado por quem cuida da parte jurídica antes de lançar. */
export default function PrivacidadePage() {
  return (
    <main className="flex-1 space-y-4 px-6 pt-8 pb-10">
      <Link href="/entrar" className="flex min-h-11 items-center text-sm font-semibold text-brand">
        ‹ Voltar
      </Link>
      <h1 className="font-display text-3xl font-extrabold">Política de Privacidade</h1>
      <p className="rounded-card bg-warn-bg p-3 text-sm text-warn-ink">Rascunho: este texto ainda será revisado antes do lançamento.</p>
      <section className="space-y-2 text-[15px]">
        <p>Guardamos o seu e-mail (para entrar), o seu nome e os dados que você cadastra: contas fixas, metas, movimentações e configurações.</p>
        <p>Cada pessoa vê somente os próprios dados. Não vendemos nem compartilhamos seus dados com terceiros para publicidade.</p>
        <p>Usamos cookies apenas para manter você conectado. Não usamos senhas.</p>
        <p>Em Ajustes você pode baixar uma cópia de todos os seus dados (JSON) e apagar a sua conta, o que remove tudo.</p>
      </section>
    </main>
  );
}
