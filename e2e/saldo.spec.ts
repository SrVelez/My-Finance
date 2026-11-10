import { expect, test, type Page } from "@playwright/test";
import { quickOnboarding } from "./helpers";

const main = (page: Page) => page.locator("main").filter({ visible: true });

async function startFresh(page: Page) {
  await page.goto("/ajustes");
  await page.getByRole("button", { name: "Apagar todos os dados" }).click();
  await page.getByRole("button", { name: "Sim, apagar tudo" }).click();
  await expect(page).toHaveURL("/onboarding");
  await quickOnboarding(page);
}

test("meta com saldo inicial → zerar → desfazer", async ({ page }) => {
  await startFresh(page);

  // Nova meta já com €200 guardados
  await page.goto("/metas/nova");
  await page.getByLabel("Nome").fill("Viagem");
  await page.getByLabel("Quanto juntar").fill("600");
  await expect(page.getByRole("radio", { name: "Não, começar do zero" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "Sim, já tenho" }).click();
  await page.getByLabel("Quanto já está guardado?").fill("200");
  await expect(page.getByTestId("opening-effect")).toContainText("Faltam €400.");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL("/metas");

  // Detalhe: €200 de €600 · 33%, e o saldo inicial no extrato
  await page.getByRole("link", { name: /Viagem/ }).first().click();
  await expect(main(page)).toContainText("€200");
  await expect(main(page)).toContainText("de €600 · 33%");
  await expect(page.getByTestId("history")).toContainText("Saldo inicial");

  // Ajustar saldo → Zerar (confirmação extra)
  await page.getByRole("button", { name: "Ajustar saldo" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByTestId("current-balance")).toContainText("€200");
  await sheet.getByRole("button", { name: "Zerar" }).click();
  await sheet.getByRole("button", { name: "Confirmar" }).click();
  await expect(sheet).toContainText("Zerar Viagem?");
  await expect(sheet).toContainText("O saldo vai de €200 para €0. O histórico fica guardado.");
  await sheet.getByRole("button", { name: "Sim, zerar" }).click();

  // Aviso com Desfazer; a tela já mostra €0 / 0% e o histórico guarda os dois registros
  const toast = page.getByRole("status");
  await expect(toast).toContainText("Saldo ajustado");
  await expect(main(page)).toContainText("de €600 · 0%");
  await expect(page.getByTestId("history")).toContainText("Zerado para começar de novo");
  await expect(page.getByTestId("history")).toContainText("Saldo inicial");

  // Desfazer restaura o saldo
  await toast.getByRole("button", { name: "Desfazer" }).click();
  await expect(toast).toContainText("Desfeito.");
  await expect(main(page)).toContainText("de €600 · 33%");
  await expect(page.getByTestId("history")).toContainText("Ajuste desfeito");
});

test("ajustar saldo: reduzir devolvendo ao livre e bloqueio ao aumentar sem livre", async ({ page }) => {
  await startFresh(page);
  await page.goto("/metas/nova");
  await page.getByLabel("Nome").fill("Reserva");
  await page.getByLabel("Quanto juntar").fill("400");
  await page.getByRole("radio", { name: "Sim, já tenho" }).click();
  await page.getByLabel("Quanto já está guardado?").fill("150");
  await page.getByRole("button", { name: "Salvar" }).click();
  await page.getByRole("link", { name: /Reserva/ }).first().click();
  await expect(main(page)).toContainText("de €400 · 38%");

  // Sem livre na semana: "tirar do livre" é bloqueado e mostra quanto há
  await page.getByRole("button", { name: "Ajustar saldo" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Novo saldo").fill("230");
  await sheet.getByRole("radio", { name: "Tirar do livre da semana" }).click();
  await expect(sheet.getByRole("alert")).toContainText("Você só tem €0 livres esta semana.");
  await expect(sheet.getByRole("button", { name: "Confirmar" })).toBeDisabled();

  // Diminuir para €100 devolvendo ao livre: prévia e confirmação
  await sheet.getByLabel("Novo saldo").fill("100");
  await expect(sheet).toContainText("O que aconteceu com a diferença de €50?");
  await sheet.getByRole("radio", { name: "Devolver para o livre da semana" }).click();
  await expect(sheet.getByTestId("adjust-effect")).toContainText("A meta vai de 38% para 25%.");
  await sheet.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("status")).toContainText("Saldo ajustado");
  await expect(main(page)).toContainText("de €400 · 25%");

  // O livre da semana subiu €50 (aparece no Início)
  await page.getByRole("link", { name: "Início" }).click();
  await expect(page.getByText("de €50 · você já gastou €0")).toBeVisible();
});
