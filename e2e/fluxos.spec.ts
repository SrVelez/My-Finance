import { expect, test } from "@playwright/test";
import { quickOnboarding, tid, toCents, typeAmount } from "./helpers";

test.describe.configure({ mode: "serial" });

test("recebi €2000 → distribuição → confirmar → gastei €23,50", async ({ page }) => {
  await quickOnboarding(page);
  await expect(page.getByText("Toque em Recebi para ver quanto separar.")).toBeVisible();

  // Recebi · valor
  await page.getByRole("link", { name: "+ Recebi" }).click();
  await expect(page.getByText("Quanto você recebeu?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver distribuição" })).toBeDisabled();
  await typeAmount(page, "2000");
  await expect(tid(page, "amount")).toHaveText("€2.000");
  await page.getByRole("button", { name: "Ver distribuição" }).click();

  // Recebi · distribuição (contas + dia a dia + folga fecham em €500)
  await expect(page.getByRole("heading", { name: "Você recebeu €2.000" })).toBeVisible();
  await expect(page.getByText("PARA GUARDAR")).toBeVisible();
  for (const name of ["Aluguel", "Curso", "Telefone"]) await expect(page.locator("li:visible").filter({ hasText: name })).toBeVisible();
  const free = toCents(await tid(page, "free").innerText());
  expect(free).toBeGreaterThanOrEqual(12000);

  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL("/");

  // Início: livre da semana = o mostrado na distribuição, nada gasto ainda
  await expect(page.getByText("você já gastou €0")).toBeVisible();
  const homeFree = page.getByRole("heading", { name: "Livre para gastar esta semana" }).locator("xpath=following-sibling::p[1]");
  await expect(homeFree).toBeVisible();
  expect(toCents(await homeFree.innerText())).toBe(free);

  // Extrato (acima de "Próximos vencimentos"): o recebimento mostra para onde foi o dinheiro
  const extrato = tid(page, "statement");
  await expect(extrato).toContainText("Recebi");
  await expect(extrato).toContainText("+€2.000");
  for (const name of ["Aluguel", "Curso", "Telefone"]) await expect(extrato.getByText("→ " + name)).toBeVisible();
  await expect(extrato.getByText("→ Livre para gastar")).toBeVisible();
  const headings = await page.getByRole("heading", { level: 2, includeHidden: false }).allInnerTexts();
  expect(headings.indexOf("Extrato")).toBeGreaterThanOrEqual(0);
  expect(headings.indexOf("Extrato")).toBeLessThan(headings.indexOf("Próximos vencimentos"));

  // Gastei €23,50
  await page.getByRole("link", { name: "− Gastei" }).click();
  await typeAmount(page, "23,50");
  await expect(tid(page, "amount")).toHaveText("€23,50");
  await expect(tid(page, "left")).toHaveText(/Sobram .* livres esta semana/);
  const left = toCents(await tid(page, "left").innerText());
  expect(left).toBe(free - 2350);
  await page.getByRole("button", { name: "Registrar gasto" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("você já gastou €23,50")).toBeVisible();

  // O gasto aparece no topo do extrato e "Ver tudo" abre o extrato completo
  await expect(tid(page, "statement").locator("> li").first()).toContainText("Mercado");
  await expect(tid(page, "statement").locator("> li").first()).toContainText("−€23,50");
  await page.getByRole("link", { name: "Ver tudo" }).click();
  await expect(page).toHaveURL("/extrato");
  await expect(page.getByRole("heading", { name: "Extrato" })).toBeVisible();
  await expect(tid(page, "statement")).toContainText("Recebi");

  // Conta: tocar abre o extrato dela, separado por data, e o ⋮ abre a edição
  await page.getByRole("link", { name: "Fechar" }).click();
  await page.getByRole("link", { name: "Contas" }).click();
  await page.getByRole("link", { name: /^Aluguel/ }).first().click();
  const history = tid(page, "history");
  await expect(history).toContainText("Hoje");
  await expect(history).toContainText("Guardado para a conta");
  await expect(history).toContainText("Do recebimento de €2.000");
  await page.getByRole("link", { name: "Editar conta" }).click();
  await expect(page.getByRole("button", { name: "Excluir conta" })).toBeVisible();
});

test("recebi pouco: não deu para tudo → seguir com menos", async ({ page }) => {
  await quickOnboarding(page);
  await page.getByRole("link", { name: "+ Recebi" }).click();
  await typeAmount(page, "50");
  await page.getByRole("button", { name: "Ver distribuição" }).click();

  await expect(page.getByText("Esta semana não deu para tudo")).toBeVisible();
  await expect(page.getByText("Faltaram €120")).toBeVisible();
  // Sem reserva de emergência, só a opção B existe
  await expect(page.getByRole("radio")).toHaveCount(1);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Livre para gastar esta semana")).toBeVisible();
});
