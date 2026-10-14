import { expect, test } from "@playwright/test";

test("onboarding: contas, metas, prioridades, prévia e começar", async ({ page }) => {
  await page.goto("/onboarding");

  // 1 · Contas fixas
  await expect(page.getByRole("heading", { name: "Quais são suas contas fixas?" })).toBeVisible();
  const next = page.getByRole("button", { name: "Continuar" });
  await expect(next).toBeDisabled();
  for (const name of ["Aluguel", "Curso", "Telefone"]) await page.getByRole("button", { name, exact: true }).click();
  await page.getByLabel("Gasto semanal").fill("120");
  await next.click();

  // 2 · Metas
  await expect(page.getByRole("heading", { name: /juntar dinheiro/ })).toBeVisible();
  for (const name of ["Reserva de emergência", "Renovação do visto", "Viagem"]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  // A última meta adicionada está em edição: dá prazo a ela e ao visto.
  await page.getByLabel("Prazo (opcional)").fill("2027-06");
  await page.getByRole("button", { name: "Pronto" }).click();
  await page.getByRole("button", { name: /Renovação do visto.*€/ }).click();
  await page.getByLabel("Prazo (opcional)").fill("2027-02");
  await page.getByRole("button", { name: "Pronto" }).click();
  await next.click();

  // 3 · Prioridades: reordena com o teclado (Viagem sobe para o topo)
  await expect(page.getByRole("heading", { name: /mais importante/ })).toBeVisible();
  const handle = page.getByRole("button", { name: "Arrastar Viagem" });
  await handle.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(250);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(250);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(250);
  await page.keyboard.press("Space");
  await expect(page.getByRole("listitem").filter({ hasText: "Viagem" }).first()).toContainText("1");
  await next.click();

  // 4 · Prévia (simulação)
  await expect(page.getByRole("heading", { name: "Veja como ficaria" })).toBeVisible();
  await expect(page.getByText("Livre para gastar esta semana")).toBeVisible();
  await expect(page.getByText("Contas fixas").last()).toBeVisible();
  await expect(page.getByText("€196").first()).toBeVisible(); // 160 + 31 + 5
  await expect(page.getByText("€120 para o dia a dia")).toBeVisible();

  await page.getByRole("button", { name: "Começar a usar" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();
});
