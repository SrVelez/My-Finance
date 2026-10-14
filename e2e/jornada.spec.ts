import { expect, test } from "@playwright/test";
import { tid, toCents, typeAmount } from "./helpers";

test("jornada completa: onboarding → recebi → gastei → metas → ajustes → apagar tudo", async ({ page }) => {
  // Onboarding com uma meta (Reserva de emergência, €25/semana sugeridos)
  await page.goto("/onboarding");
  for (const name of ["Aluguel", "Curso", "Telefone"]) await page.getByRole("button", { name, exact: true }).click();
  await page.getByLabel("Gasto semanal").fill("120");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Reserva de emergência", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click(); // prioridades
  await expect(page.getByText("Uma simulação. Nada foi registrado ainda.")).toBeVisible();
  await page.getByRole("button", { name: "Começar a usar" }).click();
  await expect(page).toHaveURL("/");

  // Recebi €1000 (folga suficiente para a meta receber os €25 em qualquer data)
  await page.getByRole("link", { name: "+ Recebi" }).click();
  await typeAmount(page, "1000");
  await page.getByRole("button", { name: "Ver distribuição" }).click();
  await expect(page.getByRole("heading", { name: "Você recebeu €1.000" })).toBeVisible();
  const free = toCents(await tid(page, "free").innerText());
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL("/");

  // Gastei €23,50
  await page.getByRole("link", { name: "− Gastei" }).click();
  await typeAmount(page, "23,50");
  await page.getByRole("button", { name: "Registrar gasto" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("você já gastou €23,50")).toBeVisible();
  await expect(page.getByText(`de €${free / 100}`, { exact: false })).toBeVisible();

  // A meta recebeu os €25 da semana
  await page.getByRole("link", { name: "Metas" }).click();
  await expect(page.getByText("€25 de €400")).toBeVisible();

  // Tocar na meta abre o extrato dela (guardado no recebimento de €1.000)
  await page.getByRole("link", { name: /Reserva de emergência/ }).click();
  await expect(tid(page, "history")).toContainText("Guardado na meta");
  await expect(tid(page, "history")).toContainText("+€25");
  await expect(tid(page, "history")).toContainText("Do recebimento de €1.000");

  // Guardar à mão: sai do livre da semana e aparece no extrato da meta
  await page.getByRole("button", { name: /Guardar/ }).click();
  await page.getByLabel("Valor a guardar").fill("10");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(tid(page, "history")).toContainText("Guardado por você");
  await expect(tid(page, "history")).toContainText("+€10");

  // Regra de negócio volta como mensagem (a meta só precisa de mais €365)
  await page.getByRole("button", { name: /Guardar/ }).click();
  await page.getByLabel("Valor a guardar").fill("9999");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "só precisa" })).toContainText("só precisa de mais");
  await page.getByRole("button", { name: "Cancelar" }).click();

  // Retirar devolve ao livre
  await page.getByRole("button", { name: /Retirar/ }).click();
  await page.getByLabel("Valor a retirar").fill("10");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(tid(page, "history")).toContainText("Retirado por você");
  await expect(tid(page, "history")).toContainText("−€10");
  await page.getByRole("link", { name: "Voltar" }).click();

  // Ajustes: nome aparece no Início
  await page.getByRole("link", { name: "Ajustes" }).click();
  await page.getByLabel("Seu nome").fill("Teste");
  await page.getByLabel("A semana começa em").selectOption("0");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("✓ Ajustes salvos")).toBeVisible();
  await page.getByRole("link", { name: "Início" }).click();
  await expect(page.getByRole("heading", { name: "Olá, Teste" })).toBeVisible();

  // Apagar todos os dados volta ao onboarding
  await page.getByRole("link", { name: "Ajustes" }).click();
  await page.getByRole("button", { name: "Apagar todos os dados" }).click();
  await page.getByRole("button", { name: "Sim, apagar tudo" }).click();
  await expect(page).toHaveURL("/onboarding");
  await expect(page.getByRole("heading", { name: "Quais são suas contas fixas?" })).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL("/onboarding");
});
