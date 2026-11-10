import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/** Áreas só para quem está logado. */
const PROTECTED = ["/contas", "/metas", "/resumo", "/ajustes", "/extrato", "/gastar", "/receber"];

/**
 * Redirecionamento rápido por cookie (Next.js 16: `proxy`, antes `middleware`). Só confere se o
 * cookie existe: NÃO valida a sessão. Toda página, ação e rota chama `requireUser()` de verdade.
 * - sem cookie em `/`: mostra as Boas-vindas (a URL continua `/`);
 * - sem cookie numa área protegida: volta para as Boas-vindas.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = !!getSessionCookie(request);

  if (pathname === "/") {
    return hasCookie ? NextResponse.next() : NextResponse.rewrite(new URL("/bem-vindo", request.url));
  }
  if (!hasCookie && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/contas/:path*", "/metas/:path*", "/resumo/:path*", "/ajustes/:path*", "/extrato/:path*", "/gastar/:path*", "/receber/:path*"],
};
