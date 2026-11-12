import { afterEach, describe, expect, it, vi } from "vitest";

// O campo de e-mail só aparece se o código de login realmente puder ser enviado.
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of ["NODE_ENV", "EMAIL_TRANSPORT", "RESEND_API_KEY", "EMAIL_FROM", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "AUTH_APPLE_ENABLED", "AUTH_EMAIL_LOGIN"]) {
    vi.stubEnv(k, undefined as unknown as string);
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(env)) if (v !== undefined) vi.stubEnv(k, v);
  return (await import("@/lib/auth/providers")).enabledProviders;
}

afterEach(() => vi.unstubAllEnvs());

describe("formas de entrar disponíveis", () => {
  it("desenvolvimento: o código aparece no terminal, então o e-mail está disponível", async () => {
    expect(await load({ NODE_ENV: "development" })).toEqual({ google: false, apple: false, email: true });
  });

  it("produção sem Resend configurado: o campo de e-mail some", async () => {
    expect((await load({ NODE_ENV: "production" })).email).toBe(false);
    expect((await load({ NODE_ENV: "production", RESEND_API_KEY: "re_x" })).email).toBe(false); // falta o remetente
    expect((await load({ NODE_ENV: "production", EMAIL_FROM: "Finança <a@b.com>" })).email).toBe(false); // falta a chave
  });

  it("produção com Resend completo: o e-mail aparece", async () => {
    expect((await load({ NODE_ENV: "production", RESEND_API_KEY: "re_x", EMAIL_FROM: "Finança <a@b.com>" })).email).toBe(true);
  });

  it("só o Google em produção: aparece o Google e não o e-mail", async () => {
    expect(await load({ NODE_ENV: "production", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "segredo" })).toEqual({ google: true, apple: false, email: false });
  });

  it("AUTH_EMAIL_LOGIN=false esconde o e-mail em qualquer ambiente (inclusive no desenvolvimento)", async () => {
    expect((await load({ NODE_ENV: "development", AUTH_EMAIL_LOGIN: "false" })).email).toBe(false);
    expect((await load({ NODE_ENV: "production", RESEND_API_KEY: "re_x", EMAIL_FROM: "Finança <a@b.com>", AUTH_EMAIL_LOGIN: "false" })).email).toBe(false);
  });

  it("os transportes de teste (arquivo/memória) contam como disponíveis, mesmo em produção", async () => {
    expect((await load({ NODE_ENV: "production", EMAIL_TRANSPORT: "file" })).email).toBe(true);
  });
});
