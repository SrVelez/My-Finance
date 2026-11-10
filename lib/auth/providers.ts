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
export const enabledProviders = { google: !!googleConfig, apple: !!appleConfig };
