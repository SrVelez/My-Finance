"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { authClient } from "@/lib/auth/client";
import { clearStored, parseStored, readRaw } from "@/lib/draftStorage";
import { OtpInput } from "./OtpInput";

type Etapa = "email" | "codigo" | "nome" | "passkey" | "salvando" | "plano_existente" | "confirmar_substituir";
type Mode = "keep" | "replace";

const RESEND_SECONDS = 30;
const MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "lu…@gmail.com": só o começo do e-mail aparece na tela do código. */
const maskEmail = (email: string) => {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}…@${domain}`;
};

/** O aparelho suporta passkey (Face ID/digital) e a conta ainda não tem nenhuma? */
async function passkeyOferecivel(): Promise<boolean> {
  try {
    if (!window.PublicKeyCredential) return false;
    if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.())) return false;
    const list = await authClient.passkey.listUserPasskeys();
    return (list.data?.length ?? 0) === 0;
  } catch {
    return false;
  }
}

interface Props {
  /** Já existe sessão (voltou do login com Google, ou já estava logado). */
  loggedIn: boolean;
  /** Veio do onboarding: o título é "Salve seu plano". */
  plano: boolean;
  /** Acabou de entrar (voltou do Google): pode pedir nome e oferecer passkey. */
  voltouDoLogin: boolean;
  providers: { google: boolean; apple: boolean };
}

export function EntrarFlow({ loggedIn, plano, voltouDoLogin, providers }: Props) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>(loggedIn ? "salvando" : "email");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [segundos, setSegundos] = useState(0);
  const [tentativas, setTentativas] = useState(0);
  const [precisaNovoCodigo, setPrecisaNovoCodigo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Rascunho gravado na conta, ou direto para o Início quando não há rascunho.
  const salvar = async (mode?: Mode) => {
    const stored = parseStored(readRaw());
    if (!stored) return router.replace("/");
    setEtapa("salvando");
    setErro(null);
    try {
      const res = await fetch("/api/onboarding/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftId: stored.draftId, draft: stored.draft, mode }),
      });
      if (res.status === 409) return setEtapa("plano_existente");
      if (res.status === 401) {
        setEtapa("email");
        return setErro("Sua sessão terminou. Entre de novo.");
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        return setErro(body?.error ?? "Não foi possível salvar seu plano. Tente de novo.");
      }
      clearStored();
      router.replace("/");
    } catch {
      setErro("Sem conexão. Tente de novo.");
    }
  };

  const depoisDoNome = async (recemEntrou: boolean) => {
    if (recemEntrou && (await passkeyOferecivel())) return setEtapa("passkey");
    await salvar();
  };

  /** Logo depois de entrar: pede o nome (se faltar) e oferece a passkey, só para quem acabou de entrar. */
  const posLogin = async (recemEntrou: boolean) => {
    const session = await authClient.getSession();
    if (recemEntrou && !session.data?.user.name?.trim()) return setEtapa("nome");
    await depoisDoNome(recemEntrou);
  };

  // Quem já chega logado (Google ou já estava logado) segue direto, sem ver a tela de e-mail.
  useEffect(() => {
    if (!loggedIn) return;
    let cancelado = false;
    (async () => {
      await Promise.resolve(); // o resto roda fora do corpo do efeito
      if (!cancelado) await (voltouDoLogin ? posLogin(true) : salvar());
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (etapa !== "codigo" || segundos <= 0) return;
    const t = setTimeout(() => setSegundos((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [etapa, segundos]);

  const pedirCodigo = async (e?: FormEvent) => {
    e?.preventDefault();
    const limpo = email.trim().toLowerCase();
    if (!EMAIL_RE.test(limpo)) return setErro("Digite um e-mail válido.");
    setErro(null);
    setOcupado(true);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: limpo, type: "sign-in" });
    setOcupado(false);
    if (error) return setErro(error.status === 429 ? "Muitas tentativas. Tente de novo em instantes." : "Não deu para enviar o código. Tente de novo.");
    setEmail(limpo);
    setCodigo("");
    setTentativas(0);
    setPrecisaNovoCodigo(false);
    setSegundos(RESEND_SECONDS);
    setEtapa("codigo");
  };

  const verificar = async (valor: string) => {
    setErro(null);
    setOcupado(true);
    const { error } = await authClient.signIn.emailOtp({ email, otp: valor });
    setOcupado(false);
    if (!error) return posLogin(true);

    setCodigo("");
    if (error.code === "OTP_EXPIRED") {
      setPrecisaNovoCodigo(true);
      return setErro("O código expirou. Enviamos outro?");
    }
    const n = tentativas + 1;
    const restam = MAX_ATTEMPTS - n;
    if (error.code === "TOO_MANY_ATTEMPTS" || restam <= 0) {
      setPrecisaNovoCodigo(true);
      return setErro("Você errou o código muitas vezes. Peça um novo código.");
    }
    setTentativas(n);
    setErro(`Código incorreto. Restam ${restam} ${restam === 1 ? "tentativa" : "tentativas"}.`);
  };

  const salvarNome = async (e: FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return setErro("Digite como podemos te chamar.");
    setErro(null);
    setOcupado(true);
    const { error } = await authClient.updateUser({ name: nome.trim().slice(0, 40) });
    setOcupado(false);
    if (error) return setErro("Não foi possível salvar o nome. Tente de novo.");
    await depoisDoNome(true);
  };

  const usarPasskey = async () => {
    setOcupado(true);
    // Cancelar a janela do aparelho não é erro: seguimos para salvar o plano do mesmo jeito.
    await authClient.passkey.addPasskey({ name: "Este aparelho" }).catch(() => null);
    setOcupado(false);
    await salvar();
  };

  const social = (provider: "google" | "apple") =>
    authClient.signIn.social({ provider, callbackURL: `/entrar?${plano ? "etapa=plano&" : ""}novo=1` });

  const titulo = plano ? "Salve seu plano" : "Entrar";

  return (
    <div className="flex flex-1 flex-col px-5 pt-5">
      <header>
        <Link href={plano ? "/onboarding" : "/"} aria-label="Voltar" className="flex size-11 items-center justify-center rounded-full text-2xl">
          ‹
        </Link>
      </header>

      <div className="mt-4 flex-1 space-y-5 pb-8">
        {etapa === "email" && (
          <>
            <Titulo
              titulo={titulo}
              texto={plano ? "Crie sua conta para guardar suas contas e metas. Sem senha." : "Entre na sua conta. Sem senha."}
            />
            <div className="space-y-3">
              {providers.google && (
                <Button variant="outline" onClick={() => social("google")}>
                  Continuar com Google
                </Button>
              )}
              {providers.apple && (
                <Button variant="outline" onClick={() => social("apple")}>
                  Continuar com Apple
                </Button>
              )}
              {(providers.google || providers.apple) && (
                <div className="flex items-center gap-3 text-xs text-muted" role="separator">
                  <span className="h-px flex-1 bg-line" />
                  ou
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
              <form onSubmit={pedirCodigo} noValidate className="space-y-3">
                <label className="block text-xs text-muted">
                  E-mail
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    placeholder="voce@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base font-semibold text-ink"
                  />
                </label>
                {erro && <FormError>{erro}</FormError>}
                <Button type="submit" disabled={ocupado || !email.trim()}>
                  {ocupado ? "Enviando…" : "Continuar com e-mail"}
                </Button>
              </form>
            </div>
            <p className="text-xs text-muted">
              Ao continuar, você concorda com os{" "}
              <Link href="/termos" className="font-semibold text-brand underline">
                Termos
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" className="font-semibold text-brand underline">
                Política de Privacidade
              </Link>
              .
            </p>
          </>
        )}

        {etapa === "codigo" && (
          <>
            <Titulo titulo="Digite o código" texto={`Enviamos um código para ${maskEmail(email)}`} />
            <OtpInput
              value={codigo}
              disabled={ocupado}
              onChange={(v) => {
                setCodigo(v);
                if (v.length === 6) void verificar(v);
              }}
            />
            {erro && <FormError>{erro}</FormError>}
            {precisaNovoCodigo && (
              <Button variant="outline" disabled={ocupado} onClick={() => pedirCodigo()}>
                Enviar outro código
              </Button>
            )}
            <div className="flex items-center justify-between text-sm">
              <button type="button" className="min-h-11 font-semibold text-brand" onClick={() => { setErro(null); setEtapa("email"); }}>
                Trocar e-mail
              </button>
              {segundos > 0 ? (
                <span className="text-muted">Reenviar em {segundos}s</span>
              ) : (
                <button type="button" className="min-h-11 font-semibold text-brand" disabled={ocupado} onClick={() => pedirCodigo()}>
                  Reenviar código
                </button>
              )}
            </div>
          </>
        )}

        {etapa === "nome" && (
          <form onSubmit={salvarNome} className="space-y-5">
            <Titulo titulo="Como podemos te chamar?" texto="Só para a gente te dar um oi no Início." />
            <label className="block text-xs text-muted">
              Seu nome
              <input
                autoComplete="given-name"
                maxLength={40}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="mt-1 min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base font-semibold text-ink"
              />
            </label>
            {erro && <FormError>{erro}</FormError>}
            <Button type="submit" disabled={ocupado}>
              {ocupado ? "Salvando…" : "Continuar"}
            </Button>
          </form>
        )}

        {etapa === "passkey" && (
          <>
            <Titulo titulo="Entrar mais rápido da próxima vez?" texto="Use o Face ID ou a digital do seu aparelho em vez de pedir um código." />
            <div className="space-y-2">
              <Button disabled={ocupado} onClick={usarPasskey}>
                Usar Face ID/digital
              </Button>
              <Button variant="ghost" disabled={ocupado} onClick={() => salvar()}>
                Agora não
              </Button>
            </div>
          </>
        )}

        {etapa === "salvando" && (
          <div role="status" className="space-y-3 pt-10 text-center">
            <p className="font-display text-2xl font-extrabold">{erro ? "Algo deu errado" : "Salvando seu plano…"}</p>
            {erro ? (
              <>
                <FormError center>{erro}</FormError>
                <Button onClick={() => salvar()}>Tentar de novo</Button>
              </>
            ) : (
              <p className="text-sm text-muted">Só um instante.</p>
            )}
          </div>
        )}

        {etapa === "plano_existente" && (
          <>
            <Titulo titulo="Você já tem um plano salvo nesta conta." texto="O que você prefere fazer com o plano que acabou de montar?" />
            <div className="space-y-2">
              <Button onClick={() => salvar("keep")}>Usar o plano salvo</Button>
              <Button variant="outline" onClick={() => setEtapa("confirmar_substituir")}>
                Substituir pelo novo
              </Button>
            </div>
          </>
        )}

        {etapa === "confirmar_substituir" && (
          <>
            <Titulo titulo="Substituir o plano salvo?" texto="" />
            <div role="alert" className="space-y-1 rounded-card border border-accent/40 bg-warn-bg p-4 text-sm text-warn-ink">
              <p className="font-bold">Os saldos atuais das suas contas e metas serão zerados.</p>
              <p>As contas e metas antigas ficam arquivadas e o histórico continua guardado.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setEtapa("plano_existente")}>
                Voltar
              </Button>
              <Button variant="outline" className="border-warn-ink text-warn-ink" onClick={() => salvar("replace")}>
                Sim, substituir
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Titulo({ titulo, texto }: { titulo: string; texto: string }): ReactNode {
  return (
    <div>
      <h1 className="font-display text-[28px] leading-[1.1] font-extrabold">{titulo}</h1>
      {texto && <p className="mt-2 text-[15px] text-muted">{texto}</p>}
    </div>
  );
}
