import { passkeyClient } from "@better-auth/passkey/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Cliente de autenticação para o navegador (mesma origem do app). Não importa nada do banco. */
export const authClient = createAuthClient({
  plugins: [emailOTPClient(), passkeyClient()],
});
