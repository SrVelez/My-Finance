import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { db } from "@/lib/db";
import { OTP_MINUTES, sendOtpEmail } from "./email";
import { appleConfig, googleConfig } from "./providers";
import { allowOtpSend } from "./throttle";

/** Endereço público do app (cookies, passkeys e links). Em produção, o https:// do domínio. */
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const isHttps = baseURL.startsWith("https://");

/** Origens extras aceitas (ex.: o IP da rede local para abrir o app no celular), separadas por vírgula. */
const trustedOrigins = [baseURL, ...(process.env.AUTH_TRUSTED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean)];

export const auth = betterAuth({
  appName: "Finança",
  baseURL,
  // Em produção é obrigatório (BETTER_AUTH_SECRET); em desenvolvimento há um valor local de fallback.
  secret:
    process.env.BETTER_AUTH_SECRET ??
    (process.env.NODE_ENV === "production" ? undefined : "financa-dev-secret-troque-em-producao-0123456789"),
  database: prismaAdapter(db, { provider: "sqlite" }),
  trustedOrigins,

  // Sessão: cookie HttpOnly + SameSite=Lax (+ Secure em https), 60 dias, renovada a cada uso diário.
  // Sem cache de sessão no cookie: encerrar um aparelho vale na hora.
  session: { expiresIn: 60 * 60 * 24 * 60, updateAge: 60 * 60 * 24 },
  advanced: {
    useSecureCookies: isHttps,
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: isHttps },
  },

  // Limite de tentativas por IP e caminho, guardado no banco (vale entre instâncias). O limite por
  // e-mail está em ./throttle. `AUTH_RATE_LIMIT=off` existe só para testes automatizados.
  rateLimit:
    process.env.AUTH_RATE_LIMIT === "off"
      ? { enabled: false }
      : { enabled: true, storage: "database", window: 60, max: 100 },

  // Entrar com Google numa conta que já existe por e-mail usa a mesma conta (nunca cria outra).
  account: { accountLinking: { enabled: true, trustedProviders: ["google", "apple"] } },
  socialProviders: { ...(googleConfig ? { google: googleConfig } : {}), ...(appleConfig ? { apple: appleConfig } : {}) },

  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: OTP_MINUTES * 60,
      allowedAttempts: 5,
      // Guardado cifrado + reenvio reaproveita o mesmo código: quem pedir códigos repetidos para o
      // e-mail de outra pessoa não invalida o código dela nem zera as tentativas.
      storeOTP: "encrypted",
      resendStrategy: "reuse",
      rateLimit: { window: 60, max: 10 },
      // Mesma tela para entrar e criar conta: e-mail novo cria a conta ao confirmar o código.
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") return;
        // Não aguardamos o envio (evita ataque por tempo) e nunca revelamos se foi negado/enviado.
        if (!(await allowOtpSend(email))) return;
        void sendOtpEmail(email, otp).catch((e) => console.error("[Finança] Falha ao enviar o código:", e));
      },
    }),
    passkey({
      rpID: new URL(baseURL).hostname,
      rpName: "Finança",
      origin: trustedOrigins,
    }),
    nextCookies(), // sempre o último
  ],
});
