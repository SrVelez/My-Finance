import { expect, type Page } from "@playwright/test";

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
