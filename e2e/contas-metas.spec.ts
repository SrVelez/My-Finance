import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { quickOnboarding } from "./helpers";

test.describe.configure({ mode: "serial" });

const yesterdayDay = () => new Date(Date.now() - 86_400_000).getDate();

async function newBill(page: Page, name: string, amount: string, day: number) {
  await page.getByRole("link", { name: "Nova conta" }).click();
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("Valor da conta").fill(amount);
  await page.getByLabel("Vence todo dia").fill(String(day));
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL("/contas");
}

test("contas: criar, já venceram ↔ não foi pago, editar e excluir", async ({ page }) => {
  await quickOnboarding(page);
  await page.getByRole("link", { name: "Contas" }).click();
  await expect(page.getByText("€785 por mês · 3 contas fixas")).toBeVisible();

  // Conta criada hoje com vencimento ontem NÃO é "considerada paga": nunca existiu antes do vencimento
  await newBill(page, "Internet", "30", yesterdayDay());
  await expect(page.getByText("€815 por mês · 4 contas fixas")).toBeVisible();
  await expect(page.getByText("JÁ VENCERAM")).toBeHidden();

  // Conta antiga (criada há 30 dias) que venceu ontem: considerada paga
  const db = new PrismaClient({ datasources: { db: { url: "file:./e2e.db" } } });
  const user = await db.user.findFirstOrThrow();
  await db.bill.create({
    data: { userId: user.id, name: "Luz", amountCents: 5000, dueDay: yesterdayDay(), createdAt: new Date(Date.now() - 30 * 86_400_000) },
  });
  await db.$disconnect();
  await page.reload();
  await expect(page.getByText("JÁ VENCERAM")).toBeVisible();
  await expect(page.getByText(/considerado pago$/)).toHaveCount(1);

  // "Não foi pago" volta a cobrar
  await page.getByRole("button", { name: "Não foi pago" }).click();
  await expect(page.getByText("A PAGAR")).toBeVisible();
  await expect(page.getByText(/não foi pago$/)).toBeVisible();
  await expect(page.getByText("JÁ VENCERAM")).toBeHidden();

  // "Paguei" quita e volta para "Já venceram"
  await page.getByRole("button", { name: "Paguei" }).click();
  await expect(page.getByText("A PAGAR")).toBeHidden();
  await expect(page.getByText("JÁ VENCERAM")).toBeVisible();

  // Editar o valor do Aluguel
  // Tocar na conta abre o extrato dela; o ⋮ leva à edição
  await page.getByRole("link", { name: /^Aluguel/ }).click();
  await expect(page.getByRole("heading", { name: "Extrato" })).toBeVisible();
  await expect(page.getByText("Nada foi guardado para esta conta ainda.")).toBeVisible();
  await page.getByRole("link", { name: "Editar conta" }).click();
  await page.getByLabel("Valor da conta").fill("700");
  await page.getByRole("button", { name: "Salvar" }).click();
  // Depois de salvar, volta ao extrato da conta (já com o novo valor)
  await expect(page.getByText("€700").first()).toBeVisible();
  await page.getByRole("link", { name: "Voltar" }).click();
  await expect(page.getByText("€925 por mês · 5 contas fixas")).toBeVisible();

  // Excluir a Internet (exige confirmação)
  await page.getByRole("link", { name: /^Internet/ }).click();
  await page.getByRole("link", { name: "Editar conta" }).click();
  await page.getByRole("button", { name: "Excluir conta" }).click();
  await page.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(page).toHaveURL("/contas");
  await expect(page.getByText("€895 por mês · 4 contas fixas")).toBeVisible();
});

test("metas: criar, status, reordenar e excluir", async ({ page }) => {
  await quickOnboarding(page);
  await page.getByRole("link", { name: "Metas" }).click();
  await expect(page.getByText("€0 guardados · €0 por semana")).toBeVisible();

  const create = async (name: string, target: string, deadline?: string) => {
    await page.getByRole("link", { name: "+ Nova meta" }).click();
    await page.getByLabel("Nome").fill(name);
    await page.getByLabel("Quanto juntar").fill(target);
    if (deadline) await page.getByLabel("Prazo (opcional)").fill(deadline);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page).toHaveURL("/metas");
  };

  await create("Viagem", "600", "2027-12");
  await create("Reserva", "400");
  await expect(page.getByText("✓ No ritmo para dez/2027")).toBeVisible();
  await expect(page.getByText("Sem prazo · completa em cerca de 16 semanas")).toBeVisible();

  // Reordenar com o teclado: Reserva sobe para o topo
  await page.getByRole("button", { name: /Reordenar/ }).click();
  const handle = page.getByRole("button", { name: "Arrastar Reserva" });
  await handle.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(250);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(250);
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByRole("button", { name: /Reordenar/ })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Reserva" }).first()).toContainText("1");

  // Excluir
  await page.getByRole("link", { name: /Viagem/ }).click();
  await expect(page.getByRole("heading", { name: "Extrato" })).toBeVisible();
  await page.getByRole("link", { name: "Editar meta" }).click();
  await page.getByRole("button", { name: "Excluir meta" }).click();
  await page.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(page).toHaveURL("/metas");
  await expect(page.getByRole("link", { name: /Viagem/ })).toHaveCount(0);
});
