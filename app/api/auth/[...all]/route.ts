import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/auth";

// Entrada do Better Auth: código por e-mail, Google/Apple, passkeys e sessões (/api/auth/*).
export const { GET, POST } = toNextJsHandler(auth);
