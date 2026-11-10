import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { UnauthorizedError } from "./errors";
import { auth } from "./auth";

/** Quem está logado. O `userId` vem SEMPRE daqui (sessão no servidor), nunca do cliente. */
export interface SessionUser {
  userId: string;
}

/** A sessão atual, ou `null` se não há (cookie ausente, expirado ou encerrado). */
export async function getOptionalUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session ? { userId: session.user.id } : null;
}

/** Exige sessão válida. Ações e rotas usam esta; sem sessão lança 401 (`UnauthorizedError`). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getOptionalUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Como `requireUser`, mas para páginas: sem sessão manda para as Boas-vindas. */
export async function requirePageUser(): Promise<SessionUser> {
  try {
    return await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/");
    throw e;
  }
}
