import { expect, test, type Page } from "@playwright/test";
import { quickOnboarding, signIn, uniqueEmail } from "./helpers";

const main = (page: Page) => page.locator("main").filter({ visible: true });
const BASE = "http://localhost:3100";
const BOAS_VINDAS = "Você recebe. O Finança diz quanto separar.";

test("Conta: e-mail, aparelhos, sair dos outros, exportar e sair", async ({ page, browser }) => {
  const email = await signIn(page);
  await quickOnboarding(page);
  await page.goto("/ajustes");
  await expect(page.getByTestId("account-email")).toHaveText(email);

  // Um segundo aparelho entra na mesma conta.
  const outro = await browser.newContext({ baseURL: BASE, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
  const outroPage = await outro.newPage();
  await signIn(outroPage, email);
  await outroPage.goto("/ajustes");
  await expect(outroPage.getByTestId("account-email")).toHaveText(email);

  // A lista do primeiro aparelho mostra os dois, e só um é "Este aparelho".
  await page.reload();
  const sessoes = page.getByTestId("sessions").locator("li");
  await expect(sessoes).toHaveCount(2);
  await expect(page.getByTestId("sessions")).toContainText("Safari no iPhone");
  await expect(page.getByTestId("sessions").getByText("Este aparelho")).toHaveCount(1);

  // Sair de todos os outros: o segundo aparelho perde o acesso, o atual continua.
  await page.getByRole("button", { name: "Sair de todos os outros" }).click();
  await expect(page.getByText("Pronto: você saiu de todos os outros aparelhos.")).toBeVisible();
  await expect(sessoes).toHaveCount(1);
  await outroPage.goto("/ajustes");
  await expect(outroPage).toHaveURL("/");
  await expect(outroPage.getByRole("heading", { name: BOAS_VINDAS })).toBeVisible();
  await outro.close();
  await page.reload();
  await expect(page.getByTestId("account-email")).toHaveText(email);

  // Exportar: baixa um JSON só com os dados desta conta.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Baixar meus dados" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^financa-dados-\d{4}-\d{2}-\d{2}\.json$/);
  const data = await (await page.request.get("/api/account/export")).json();
  expect(data.user.email).toBe(email);
  expect(data.bills.map((b: { name: string }) => b.name).sort()).toEqual(["Aluguel", "Curso", "Telefone"]);

  // Sair: volta às Boas-vindas e as áreas protegidas fecham.
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("heading", { name: BOAS_VINDAS })).toBeVisible();
  await page.goto("/contas");
  await expect(page).toHaveURL("/");
});

test("Conta: apagar a conta exige digitar o e-mail e remove tudo", async ({ page }) => {
  const email = await signIn(page);
  await quickOnboarding(page);
  await page.goto("/ajustes");

  await page.getByRole("button", { name: "Apagar minha conta" }).click();
  const confirmar = page.getByRole("button", { name: "Apagar minha conta" }).last();
  await expect(confirmar).toBeDisabled();
  await page.getByLabel(/Para confirmar, digite/).fill("outro@teste.dev");
  await expect(confirmar).toBeDisabled();
  await page.getByLabel(/Para confirmar, digite/).fill(email.toUpperCase());
  await expect(confirmar).toBeEnabled();
  await confirmar.click();

  // Volta às Boas-vindas, sem sessão.
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: BOAS_VINDAS })).toBeVisible();
  expect((await page.request.get("/api/dashboard?periodo=semana")).status()).toBe(401);

  // Entrar de novo com o mesmo e-mail cria uma conta nova, vazia: nada do que foi apagado volta.
  await signIn(page, email);
  await page.goto("/contas");
  await expect(main(page)).toContainText("Nenhuma conta ainda.");
  await expect(main(page)).not.toContainText("Aluguel");
});

test("Conta: o nome se edita em Conta e o e-mail só aparece", async ({ page }) => {
  const email = uniqueEmail();
  await signIn(page, email);
  await quickOnboarding(page);
  await page.goto("/ajustes");
  await expect(page.getByTestId("account-email")).toHaveText(email);
  await expect(page.getByRole("textbox", { name: "E-mail" })).toHaveCount(0); // não é um campo editável
  await page.getByLabel("Nome", { exact: true }).fill("Maria");
  await page.getByRole("button", { name: "Salvar nome" }).click();
  await expect(page.getByText("✓ Nome salvo")).toBeVisible();
  await page.getByRole("link", { name: "Início" }).click();
  await expect(page.getByRole("heading", { name: "Olá, Maria" })).toBeVisible();
});
