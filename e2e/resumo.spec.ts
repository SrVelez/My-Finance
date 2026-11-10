import { expect, test } from "@playwright/test";
import { quickOnboarding, signIn, tid, typeAmount } from "./helpers";

test("registrar gasto → o ritmo da semana no Resumo atualiza", async ({ page }) => {
  // Cada teste é uma pessoa nova, sem dados.
  await signIn(page);
  await quickOnboarding(page);

  // Recebi €2000 (o suficiente para sobrar livre em qualquer data)
  await page.getByRole("link", { name: "+ Recebi" }).click();
  await typeAmount(page, "2000");
  await page.getByRole("button", { name: "Ver distribuição" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL("/");

  // Resumo: livre da semana, nada gasto ainda
  await page.getByRole("link", { name: "Resumo" }).click();
  await expect(page).toHaveURL("/resumo");
  await expect(page.getByRole("heading", { name: "Resumo" })).toBeVisible();
  await expect(tid(page, "ritmo-frase")).toContainText("Você gastou €0 de");

  // Gastei €23,50
  await page.getByRole("link", { name: "Início" }).click();
  await page.getByRole("link", { name: "− Gastei" }).click();
  await typeAmount(page, "23,50");
  await page.getByRole("button", { name: "Registrar gasto" }).click();
  await expect(page).toHaveURL("/");

  // De volta ao Resumo, o ritmo já mostra o gasto
  await page.getByRole("link", { name: "Resumo" }).click();
  await expect(tid(page, "ritmo-frase")).toContainText("Você gastou €23,50 de");

  // Período "Mês" aparece e fica lembrado depois de recarregar
  await page.getByRole("radio", { name: "Mês" }).click();
  await expect(page.getByRole("heading", { name: "Gastos por categoria" })).toBeVisible();
  await expect(page.getByText("Seu histórico aparece depois de 3 recebimentos. Faltam 2.").first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Mês" })).toHaveAttribute("aria-checked", "true");
});
