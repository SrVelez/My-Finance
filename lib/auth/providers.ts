/** Configuração dos logins sociais, lida do ambiente. Sem dependência do banco (a tela de entrada importa daqui). */
export const googleConfig =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
    : undefined;

/** Apple: pronta, mas desligada até `AUTH_APPLE_ENABLED=true` (exige conta de desenvolvedor Apple). */
export const appleConfig =
  process.env.AUTH_APPLE_ENABLED === "true" && process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
    ? { clientId: process.env.APPLE_CLIENT_ID, clientSecret: process.env.APPLE_CLIENT_SECRET }
    : undefined;

/** Quais "Continuar com…" aparecem na tela de entrada. */
export type EmailTransport = "console" | "file" | "memory" | "resend";

/**
 * Como o código de login é enviado: desenvolvimento imprime no terminal; produção usa o Resend.
 * `EMAIL_TRANSPORT=file|memory` existe só para testes automatizados.
 */
export function emailTransport(): EmailTransport {
  const t = process.env.EMAIL_TRANSPORT;
  if (t === "console" || t === "file" || t === "memory" || t === "resend") return t;
  return process.env.NODE_ENV === "production" ? "resend" : "console";
}

/** Entrar por código só faz sentido se o e-mail realmente puder ser enviado (o campo some se não puder). */
export const emailLoginEnabled = emailTransport() !== "resend" || (!!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM);

export const enabledProviders = { google: !!googleConfig, apple: !!appleConfig, email: emailLoginEnabled };
