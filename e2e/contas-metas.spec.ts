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

test("contas: você pagou?, atraso, vencimento próximo, editar e excluir", async ({ page }) => {
  await quickOnboarding(page);
  await page.getByRole("link", { name: "Contas" }).click();
  await expect(page.getByText("€785 por mês · 3 contas fixas")).toBeVisible();

  // Conta criada hoje com vencimento ontem NÃO é "considerada paga": nunca existiu antes do vencimento
  await newBill(page, "Internet", "30", yesterdayDay());
  await expect(page.getByText("€815 por mês · 4 contas fixas")).toBeVisible();
  await expect(page.getByRole("heading", { name: "JÁ VENCERAM" })).toBeHidden();

  // Conta antiga (criada há 30 dias) que venceu ontem, e outra que vence em 3 dias
  const db = new PrismaClient({ datasources: { db: { url: "file:./e2e.db" } } });
  const user = await db.user.findFirstOrThrow();
  const old = new Date(Date.now() - 30 * 86_400_000);
  await db.bill.create({ data: { userId: user.id, name: "Luz", amountCents: 5000, dueDay: yesterdayDay(), createdAt: old } });
  await db.bill.create({ data: { userId: user.id, name: "Gás", amountCents: 4000, dueDay: new Date(Date.now() + 3 * 86_400_000).getDate(), createdAt: new Date(Date.now() - 86_400_000) } });
  await db.$disconnect();
  await page.reload();

  // Vencimento próximo: aviso em destaque e quanto ainda cabe até lá
  await expect(page.getByText(/Vence em 3 dias/)).toBeVisible();

  // O app NÃO assume que foi paga: pergunta "Você pagou?"
  const luz = page.getByRole("group", { name: "Confirmar pagamento de Luz" });
  await expect(page.getByRole("heading", { name: "A CONFIRMAR" })).toBeVisible();
  await expect(luz).toContainText("Você pagou?");
  await expect(page.getByRole("heading", { name: "JÁ VENCERAM" })).toBeHidden();

  // "Ainda não paguei": vira atraso
  await luz.getByRole("button", { name: "Ainda não paguei" }).click();
  await expect(page.getByRole("heading", { name: "EM ATRASO" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A CONFIRMAR" })).toBeHidden();

  // Pagamento parcial (€20 de €50): o resto continua em atraso
  await luz.getByRole("button", { name: "Paguei outro valor" }).click();
  await luz.getByLabel("Valor pago").fill("20");
  await luz.getByRole("button", { name: "Confirmar" }).click();
  await expect(luz).toContainText("Falta pagar €30");

  // Pagar o que falta fecha a conta e ela vai para "Já venceram"
  await luz.getByRole("button", { name: "Paguei", exact: true }).click();
  await expect(page.getByRole("heading", { name: "EM ATRASO" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "JÁ VENCERAM" })).toBeVisible();
  await expect(page.getByText("pagamento confirmado")).toHaveCount(1);

  // Nada estava guardado: os €50 saíram do livre e aparecem no extrato do Início
  await page.getByRole("link", { name: "Início" }).click();
  const extrato = page.locator('[data-testid="statement"]:visible');
  await expect(extrato).toContainText("Luz");
  await expect(extrato).toContainText("Pagamento de conta");
  await page.getByRole("link", { name: "Contas" }).click();

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
  await expect(page.getByText("€965 por mês · 6 contas fixas")).toBeVisible();

  // Excluir a Internet (exige confirmação)
  await page.getByRole("link", { name: /^Internet/ }).click();
  await page.getByRole("link", { name: "Editar conta" }).click();
  await page.getByRole("button", { name: "Excluir conta" }).click();
  await page.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(page).toHaveURL("/contas");
  await expect(page.getByText("€935 por mês · 5 contas fixas")).toBeVisible();
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

  // Meta cujo prazo venceu: pausada, e o app pergunta o que fazer
  const db = new PrismaClient({ datasources: { db: { url: "file:./e2e.db" } } });
  const user = await db.user.findFirstOrThrow();
  await db.goal.create({
    data: { userId: user.id, name: "Curso antigo", targetCents: 30000, savedCents: 10000, deadline: "2026-01", priority: 50 },
  });
  await db.$disconnect();
  await page.reload();
  await expect(page.getByText("Prazo de jan/2026 venceu · escolha o que fazer")).toBeVisible();

  await page.getByRole("link", { name: /Curso antigo/ }).click();
  const panel = page.getByRole("group", { name: "O prazo da meta venceu" });
  await expect(panel).toContainText("O prazo de jan/2026 passou");

  // Regra de negócio volta como mensagem: não dá para estender para um mês que já passou
  await panel.getByRole("radio", { name: /Estender o prazo/ }).click();
  await panel.getByLabel("Novo prazo").fill("2026-02");
  await panel.getByRole("button", { name: "Confirmar" }).click();
  await expect(panel.getByRole("alert")).toContainText("ainda não passou");

  // Continuar sem prazo resolve: o painel some e a meta volta a ter valor semanal
  await panel.getByRole("radio", { name: /Continuar sem prazo/ }).click();
  await panel.getByRole("button", { name: "Confirmar" }).click();
  await expect(panel).toBeHidden();
  // (rotas anteriores ficam ocultas no DOM com Cache Components: considere só o visível)
  await expect(page.getByText(/Sem prazo · completa em cerca de/).filter({ visible: true })).toHaveCount(1);
});
