"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteAccountAction } from "@/app/(app)/ajustes/actions";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { useAction } from "@/components/ui/useAction";
import { authClient } from "@/lib/auth/client";
import { describeDevice } from "@/lib/userAgent";

interface SessionRow {
  id: string;
  userAgent?: string | null;
  updatedAt: Date | string;
}
interface PasskeyRow {
  id: string;
  name?: string | null;
  createdAt?: Date | string | null;
}

const when = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d)) : "";

const card = "space-y-3 rounded-card border border-line bg-surface p-4";

/** Ajustes → Conta: nome e e-mail, formas de entrar, aparelhos, exportar, apagar e sair. */
export function AccountSection({ name, email, googleEnabled }: { name: string; email: string; googleEnabled: boolean }) {
  const router = useRouter();
  const [nome, setNome] = useState(name);
  const [nomeSalvo, setNomeSalvo] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyRow[] | null>(null);
  const [googleConectado, setGoogleConectado] = useState(false);
  const [suportaPasskey, setSuportaPasskey] = useState(false);
  const [recarregar, setRecarregar] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const [emailDigitado, setEmailDigitado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const apagar = useAction("Não foi possível apagar a conta. Tente de novo.");

  // Carrega aparelhos, passkeys e contas conectadas (tudo vem do Better Auth, só do usuário logado).
  useEffect(() => {
    let cancelado = false;
    (async () => {
      await Promise.resolve();
      const [list, current, accounts, keys] = await Promise.all([
        authClient.listSessions(),
        authClient.getSession(),
        authClient.listAccounts(),
        authClient.passkey.listUserPasskeys(),
      ]);
      if (cancelado) return;
      setSessions((list.data as SessionRow[] | null) ?? []);
      setCurrentId(current.data?.session.id ?? null);
      setGoogleConectado((accounts.data ?? []).some((a) => a.providerId === "google"));
      setPasskeys((keys.data as PasskeyRow[] | null) ?? []);
      setSuportaPasskey(typeof window !== "undefined" && !!window.PublicKeyCredential);
    })();
    return () => {
      cancelado = true;
    };
  }, [recarregar]);

  const refazer = () => setRecarregar((n) => n + 1);

  const salvarNome = async () => {
    setOcupado(true);
    setMsg(null);
    const { error } = await authClient.updateUser({ name: nome.trim().slice(0, 40) });
    setOcupado(false);
    if (error) return setMsg("Não foi possível salvar o nome. Tente de novo.");
    setNomeSalvo(true);
    router.refresh();
  };

  const sair = async () => {
    setOcupado(true);
    await authClient.signOut();
    router.replace("/");
    router.refresh();
  };

  const sairDosOutros = async () => {
    setOcupado(true);
    setMsg(null);
    const { error } = await authClient.revokeOtherSessions();
    setOcupado(false);
    if (error) return setMsg("Não foi possível sair dos outros aparelhos. Tente de novo.");
    setMsg("Pronto: você saiu de todos os outros aparelhos.");
    refazer();
  };

  const adicionarPasskey = async () => {
    setOcupado(true);
    setMsg(null);
    const { error } = await authClient.passkey.addPasskey({ name: "Este aparelho" });
    setOcupado(false);
    if (error) setMsg("Não foi possível adicionar a passkey agora.");
    refazer();
  };

  const removerPasskey = async (id: string) => {
    setOcupado(true);
    await authClient.passkey.deletePasskey({ id });
    setOcupado(false);
    refazer();
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="t-conta" className={card}>
        <h2 id="t-conta" className="font-bold">Conta</h2>
        <label className="block text-xs text-muted">
          Nome
          <input
            value={nome}
            maxLength={40}
            onChange={(e) => {
              setNome(e.target.value);
              setNomeSalvo(false);
            }}
            className="mt-1 min-h-12 w-full rounded-xl border border-line bg-canvas px-3 text-base font-semibold text-ink"
          />
        </label>
        <Button variant="outline" disabled={ocupado || !nome.trim() || nome.trim() === name} onClick={salvarNome}>
          Salvar nome
        </Button>
        {nomeSalvo && <p role="status" className="text-sm font-semibold text-brand">✓ Nome salvo</p>}
        <div className="text-xs text-muted">
          E-mail
          <p className="mt-1 text-base font-semibold break-all text-ink" data-testid="account-email">{email}</p>
        </div>
      </section>

      <section aria-labelledby="t-entrar" className={card}>
        <h2 id="t-entrar" className="font-bold">Formas de entrar</h2>
        <ul className="divide-y divide-line text-sm">
          <li className="flex min-h-11 items-center justify-between py-2">
            <span>Código por e-mail</span>
            <span className="text-xs font-semibold text-brand">Ativo</span>
          </li>
          {googleConectado && (
            <li className="flex min-h-11 items-center justify-between py-2">
              <span>Google</span>
              <span className="text-xs font-semibold text-brand">Conectado</span>
            </li>
          )}
          {(passkeys ?? []).map((p) => (
            <li key={p.id} className="flex min-h-11 items-center justify-between gap-2 py-2">
              <span>
                Passkey · {p.name || "Sem nome"}
                {p.createdAt && <span className="block text-xs text-muted">Criada em {when(p.createdAt)}</span>}
              </span>
              <button type="button" disabled={ocupado} onClick={() => removerPasskey(p.id)} className="min-h-11 text-xs font-semibold text-warn-ink">
                Remover
              </button>
            </li>
          ))}
        </ul>
        {suportaPasskey && (
          <Button variant="outline" disabled={ocupado} onClick={adicionarPasskey}>
            Adicionar passkey
          </Button>
        )}
        {googleEnabled && !googleConectado && (
          <Button variant="outline" onClick={() => authClient.linkSocial({ provider: "google", callbackURL: "/ajustes" })}>
            Conectar Google
          </Button>
        )}
      </section>

      <section aria-labelledby="t-aparelhos" className={card}>
        <h2 id="t-aparelhos" className="font-bold">Aparelhos conectados</h2>
        {sessions === null ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : (
          <ul className="divide-y divide-line text-sm" data-testid="sessions">
            {sessions.map((s) => (
              <li key={s.id} className="flex min-h-11 items-center justify-between gap-2 py-2">
                <span>
                  {describeDevice(s.userAgent)}
                  <span className="block text-xs text-muted">Último uso: {when(s.updatedAt)}</span>
                </span>
                {s.id === currentId && <span className="rounded-md bg-brand-soft px-2 py-1 text-xs font-semibold text-brand-strong">Este aparelho</span>}
              </li>
            ))}
          </ul>
        )}
        {msg && <p role="status" className="text-sm font-semibold text-brand">{msg}</p>}
        <div className="grid gap-2">
          <Button variant="outline" disabled={ocupado} onClick={sair}>
            Sair deste aparelho
          </Button>
          <Button variant="outline" disabled={ocupado || (sessions?.length ?? 0) < 2} onClick={sairDosOutros}>
            Sair de todos os outros
          </Button>
        </div>
      </section>

      <section aria-labelledby="t-exportar" className={card}>
        <h2 id="t-exportar" className="font-bold">Exportar meus dados</h2>
        <p className="text-xs text-muted">Baixa um arquivo JSON com suas contas, metas, movimentações, ajustes e configurações.</p>
        <a
          href="/api/account/export"
          download
          className="flex min-h-12 w-full items-center justify-center rounded-xl border border-line bg-surface text-base font-bold text-ink"
        >
          Baixar meus dados
        </a>
      </section>

      <section aria-labelledby="t-apagar" className={card}>
        <h2 id="t-apagar" className="font-bold">Apagar minha conta</h2>
        <p className="text-xs text-muted">Apaga sua conta e tudo o que está nela, de todos os aparelhos. Não dá para desfazer.</p>
        {confirmarApagar ? (
          <div className="space-y-3">
            <label className="block text-xs text-muted">
              Para confirmar, digite {email}
              <input
                value={emailDigitado}
                autoComplete="off"
                autoCapitalize="none"
                onChange={(e) => setEmailDigitado(e.target.value)}
                className="mt-1 min-h-12 w-full rounded-xl border border-line bg-canvas px-3 text-base font-semibold text-ink"
              />
            </label>
            {apagar.error && <FormError>{apagar.error}</FormError>}
            {msg && <FormError>{msg}</FormError>}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" disabled={apagar.pending} onClick={() => { setConfirmarApagar(false); setEmailDigitado(""); setMsg(null); }}>
                Cancelar
              </Button>
              <Button
                variant="outline"
                className="border-warn-ink text-warn-ink"
                disabled={apagar.pending || emailDigitado.trim().toLowerCase() !== email.toLowerCase()}
                onClick={() =>
                  apagar.run(async () => {
                    const r = await deleteAccountAction(emailDigitado);
                    if (!r.ok) setMsg(r.error);
                  })
                }
              >
                {apagar.pending ? "Apagando…" : "Apagar minha conta"}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="text-warn-ink" onClick={() => setConfirmarApagar(true)}>
            Apagar minha conta
          </Button>
        )}
      </section>

      <Button variant="outline" disabled={ocupado} onClick={sair}>
        Sair
      </Button>
    </div>
  );
}
