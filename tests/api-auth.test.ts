import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// Caso 11: sem sessão, toda rota da API do app responde 401 e as áreas protegidas voltam às Boas-vindas.
process.env.DATABASE_URL = "file:./vitest-apiauth.db";
process.env.BETTER_AUTH_SECRET = "teste-teste-teste-teste-teste-teste-123456";

vi.mock("next/headers", () => ({ headers: async () => new Headers() })); // nenhum cookie de sessão
vi.mock("@/lib/services/today", () => ({ serverToday: async () => "2026-11-10" }));

/** Todas as rotas de API do app, menos a do próprio Better Auth (que cuida das suas sessões). */
function appRoutes(dir = path.resolve(__dirname, "../app/api")): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "auth" ? [] : appRoutes(full);
    return name === "route.ts" ? [full] : [];
  });
}

describe("11. sem sessão", () => {
  it("existe pelo menos uma rota de API do app para proteger", () => {
    expect(appRoutes().length).toBeGreaterThan(0);
  });

  it("toda rota da API do app responde 401 (e nunca 200, 404 ou 500)", async () => {
    for (const file of appRoutes()) {
      const mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
      const handlers = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) => typeof mod[m] === "function");
      expect(handlers.length, `${file} exporta algum método`).toBeGreaterThan(0);
      for (const method of handlers) {
        const request = new Request("http://localhost/api/x?periodo=semana", {
          method,
          headers: { "content-type": "application/json" },
          body: method === "GET" ? undefined : "{}",
        });
        const res = await (mod[method] as (r: Request) => Promise<Response>)(request);
        expect(res.status, `${method} ${path.relative(process.cwd(), file)}`).toBe(401);
      }
    }
  });

  it("requireUser() lança 401 e requirePageUser() manda para as Boas-vindas", async () => {
    const { requireUser, requirePageUser } = await import("@/lib/auth/session");
    const { UnauthorizedError } = await import("@/lib/auth/errors");
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(requireUser()).rejects.toMatchObject({ status: 401 });
    // O redirect do Next é uma exceção especial (NEXT_REDIRECT para "/").
    await expect(requirePageUser()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
  });

  describe("proxy (redirecionamento rápido por cookie)", () => {
    const req = (p: string, cookie?: string) =>
      new NextRequest(`http://localhost:3000${p}`, { headers: cookie ? { cookie } : {} });

    it("áreas protegidas sem cookie voltam para as Boas-vindas", async () => {
      const { proxy } = await import("../proxy");
      for (const p of ["/contas", "/contas/nova", "/contas/abc", "/metas", "/metas/x/editar", "/resumo", "/ajustes", "/extrato", "/gastar", "/receber"]) {
        const res = proxy(req(p));
        expect(res.status, p).toBe(307);
        expect(new URL(res.headers.get("location") ?? "").pathname, p).toBe("/");
      }
    });

    it("a raiz sem cookie mostra as Boas-vindas (a URL continua /) e com cookie segue para o Início", async () => {
      const { proxy } = await import("../proxy");
      const semCookie = proxy(req("/"));
      expect(semCookie.headers.get("x-middleware-rewrite")).toContain("/bem-vindo");
      const comCookie = proxy(req("/", "better-auth.session_token=abc.def"));
      expect(comCookie.headers.get("x-middleware-rewrite")).toBeNull();
      expect(comCookie.headers.get("x-middleware-next")).toBe("1");
    });

    it("com cookie, as áreas protegidas passam (a validação real é feita em cada página, ação e rota)", async () => {
      const { proxy } = await import("../proxy");
      const res = proxy(req("/contas", "better-auth.session_token=abc.def"));
      expect(res.headers.get("x-middleware-next")).toBe("1");
    });

    it("rotas públicas (onboarding, entrada, auth) nunca são redirecionadas", async () => {
      const { proxy, config } = await import("../proxy");
      for (const p of ["/onboarding", "/entrar", "/bem-vindo", "/api/auth/get-session"]) {
        expect(config.matcher.some((m) => new RegExp(`^${m.replace(/:path\*/g, ".*")}$`).test(p)), p).toBe(false);
      }
      expect(proxy(req("/onboarding")).headers.get("x-middleware-next")).toBe("1");
    });
  });
});
