import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

const PORT = 3100;
/** Onde o servidor de teste grava os códigos de login (EMAIL_TRANSPORT=file, ver playwright.config.ts). */
export const OTP_FILE = path.resolve(".otp-e2e", "outbox.jsonl");

let counter = 0;
/** E-mail novo e único: cada teste é uma pessoa diferente, com dados só dela. */
export const uniqueEmail = () => `e2e-${Date.now().toString(36)}-${++counter}@teste.dev`;

/** Lê o último código enviado para o e-mail (o servidor de teste o grava em arquivo). */
export async function codeFor(email: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    if (existsSync(OTP_FILE)) {
      const lines = readFileSync(OTP_FILE, "utf8").trim().split("\n").filter(Boolean);
      for (const line of lines.reverse()) {
        const m = JSON.parse(line) as { email: string; code: string };
        if (m.email === email) return m.code;
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Nenhum código foi enviado para ${email}`);
}

/** Apaga os códigos antigos (rode uma vez antes de tudo, se quiser um arquivo limpo). */
export const clearOutbox = () => rmSync(OTP_FILE, { force: true });

/**
 * Entra com um e-mail novo (cria a conta) pela API do Better Auth: pede o código, lê do arquivo e
 * confirma. O cookie de sessão fica no navegador do teste. Devolve o e-mail.
 */
export async function signIn(page: Page, email = uniqueEmail()): Promise<string> {
  const headers = { origin: `http://localhost:${PORT}` };
  const sent = await page.request.post("/api/auth/email-otp/send-verification-otp", { data: { email, type: "sign-in" }, headers });
  expect(sent.ok(), "pedir o código").toBe(true);
  const signed = await page.request.post("/api/auth/sign-in/email-otp", { data: { email, otp: await codeFor(email) }, headers });
  expect(signed.ok(), "confirmar o código").toBe(true);
  return email;
}

/** Onboarding rápido: 3 contas, €120/semana, sem metas. */
export async function quickOnboarding(page: Page) {
  await page.goto("/onboarding");
  for (const name of ["Aluguel", "Curso", "Telefone"]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await page.getByLabel("Gasto semanal").fill("120");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await page.getByRole("button", { name: "Começar a usar" }).click();
  await expect(page).toHaveURL("/");
}

/**
 * Com Cache Components o Next mantém rotas anteriores ocultas no DOM (Activity),
 * então buscas por testid/texto precisam considerar só o que está visível.
 */
export const tid = (page: Page, id: string) => page.locator(`[data-testid="${id}"]:visible`);

/** Digita um valor no teclado da tela (ex.: "23,50"). */
export async function typeAmount(page: Page, value: string) {
  for (const ch of value) {
    const name = ch === "," ? "Vírgula" : ch;
    await page.getByRole("group", { name: "Teclado numérico" }).getByRole("button", { name, exact: true }).click();
  }
}

/** Lê "€254" / "€23,50" como centavos. */
export function toCents(text: string): number {
  const m = text.match(/€([\d.]+)(?:,(\d{1,2}))?/);
  if (!m) throw new Error(`Sem valor em "${text}"`);
  return Number(m[1].replace(/\./g, "")) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}
