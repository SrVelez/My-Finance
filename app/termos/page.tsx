import Link from "next/link";

export const metadata = { title: "Termos de Uso · Finança" };

/** RASCUNHO: texto provisório, a ser revisado por quem cuida da parte jurídica antes de lançar. */
export default function TermosPage() {
  return (
    <main className="flex-1 space-y-4 px-6 pt-8 pb-10">
      <Link href="/entrar" className="flex min-h-11 items-center text-sm font-semibold text-brand">
        ‹ Voltar
      </Link>
      <h1 className="font-display text-3xl font-extrabold">Termos de Uso</h1>
      <p className="rounded-card bg-warn-bg p-3 text-sm text-warn-ink">Rascunho: este texto ainda será revisado antes do lançamento.</p>
      <section className="space-y-2 text-[15px]">
        <p>O Finança é um assistente de finanças pessoais: você informa quanto recebeu e ele sugere quanto separar para contas fixas, dia a dia e metas.</p>
        <p>As sugestões são orientações simples e não substituem aconselhamento financeiro profissional. Você decide o que fazer com o seu dinheiro.</p>
        <p>O Finança não movimenta nem guarda dinheiro: ele só registra os valores que você informa.</p>
        <p>Você é responsável por manter o acesso à sua conta seguro e pode apagá-la a qualquer momento em Ajustes.</p>
      </section>
    </main>
  );
}
