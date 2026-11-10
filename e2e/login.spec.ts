import { expect, test, type Page } from "@playwright/test";
import { codeFor, signIn, uniqueEmail } from "./helpers";

const main = (page: Page) => page.locator("main").filter({ visible: true });
/** Alertas da tela (o anunciador de rotas do Next também usa role="alert"). */
const alerta = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

/** Onboarding sem login: Aluguel, Curso e Telefone, €120 por semana, sem metas; para na prévia. */
async function onboardingAtePrevia(page: Page, contas = ["Aluguel", "Curso", "Telefone"]) {
  await page.goto("/onboarding");
  for (const name of contas) await page.getByRole("button", { name, exact: true }).click();
  await page.getByLabel("Gasto semanal").fill("120");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Pular por agora" }).click();
  await expect(page.getByText("Uma simulação. Nada foi registrado ainda.")).toBeVisible();
}

test("Boas-vindas → onboarding → prévia → Salve seu plano → código → Início com o rascunho; outro e-mail começa vazio", async ({ page }) => {
  // 1. Boas-vindas: a primeira tela de quem não está logado (a URL continua "/").
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Você recebe. O Finança diz quanto separar." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Já tenho conta" })).toHaveAttribute("href", "/entrar");
  await page.getByRole("link", { name: "Começar" }).click();
  await expect(page).toHaveURL("/onboarding");

  // 2. Onboarding e prévia, sem nenhum cadastro.
  await onboardingAtePrevia(page);
  await page.getByRole("button", { name: "Começar a usar" }).click();

  // 3. "Salve seu plano": e-mail (nada vem pré-marcado), termos e política em links.
  await expect(page).toHaveURL(/\/entrar\?etapa=plano/);
  await expect(page.getByRole("heading", { name: "Salve seu plano" })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Termos" })).toHaveAttribute("href", "/termos");
  await expect(page.getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute("href", "/privacidade");
  await expect(page.getByRole("button", { name: /Continuar com Google/ })).toHaveCount(0); // sem credenciais no teste
  await page.getByLabel("E-mail").fill("isso-nao-e-email");
  await page.getByRole("button", { name: "Continuar com e-mail" }).click();
  await expect(alerta(page)).toContainText("Digite um e-mail válido.");

  const email = uniqueEmail();
  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("button", { name: "Continuar com e-mail" }).click();

  // 4. Código: e-mail mascarado, erro em linguagem simples, depois o código certo (colado inteiro).
  const [user, domain] = email.split("@");
  await expect(page.getByText(`Enviamos um código para ${user.slice(0, 2)}…@${domain}`)).toBeVisible();
  await expect(page.getByText(/Reenviar em \d+s/)).toBeVisible();
  await page.getByLabel("Dígito 1").fill("000000");
  await expect(alerta(page)).toContainText("Código incorreto. Restam 4 tentativas.");
  await page.getByLabel("Dígito 1").fill(await codeFor(email));

  // 5. Nome (login por e-mail e ainda sem nome) e a oferta de passkey (opcional: dá para pular).
  await expect(page.getByRole("heading", { name: "Como podemos te chamar?" })).toBeVisible();
  await page.getByLabel("Seu nome").fill("Teste");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Entrar mais rápido da próxima vez?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Usar Face ID/digital" })).toBeVisible();
  await page.getByRole("button", { name: "Agora não" }).click();

  // 6. Início com os dados do rascunho.
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Olá, Teste" })).toBeVisible();
  await page.getByRole("link", { name: "Contas" }).click();
  for (const name of ["Aluguel", "Curso", "Telefone"]) await expect(main(page)).toContainText(name);

  // 7. Sair e entrar com outro e-mail: nada do primeiro aparece.
  const origin = { origin: "http://localhost:3100" };
  expect((await page.request.post("/api/auth/sign-out", { headers: origin, data: {} })).ok()).toBe(true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Você recebe. O Finança diz quanto separar." })).toBeVisible();

  await signIn(page);
  await page.goto("/contas");
  await expect(main(page)).toContainText("Nenhuma conta ainda.");
  await expect(main(page)).not.toContainText("Aluguel");
});

test("conta que já tem plano: 'Usar o plano salvo' e 'Substituir pelo novo' (com confirmação extra)", async ({ page }) => {
  await signIn(page);
  await onboardingAtePrevia(page, ["Aluguel", "Curso"]);
  await page.getByRole("button", { name: "Começar a usar" }).click();
  await expect(page).toHaveURL("/"); // conta sem plano: grava direto
  await page.getByRole("link", { name: "Contas" }).click();
  await expect(main(page)).toContainText("Aluguel");

  // Novo rascunho com outra conta: a pessoa já tem plano, então precisa escolher.
  await onboardingAtePrevia(page, ["Internet"]);
  await page.getByRole("button", { name: "Começar a usar" }).click();
  await expect(page.getByRole("heading", { name: "Você já tem um plano salvo nesta conta." })).toBeVisible();

  // Usar o plano salvo: descarta o rascunho e nada muda.
  await page.getByRole("button", { name: "Usar o plano salvo" }).click();
  await expect(page).toHaveURL("/");
  await page.getByRole("link", { name: "Contas" }).click();
  await expect(main(page)).toContainText("Aluguel");
  await expect(main(page)).not.toContainText("Internet");

  // Substituir: pede confirmação, arquiva o antigo e grava o novo.
  await onboardingAtePrevia(page, ["Internet"]);
  await page.getByRole("button", { name: "Começar a usar" }).click();
  await page.getByRole("button", { name: "Substituir pelo novo" }).click();
  await expect(alerta(page)).toContainText("Os saldos atuais das suas contas e metas serão zerados.");
  await page.getByRole("button", { name: "Sim, substituir" }).click();
  await expect(page).toHaveURL("/");
  await page.getByRole("link", { name: "Contas" }).click();
  await expect(main(page)).toContainText("Internet");
  await expect(main(page)).not.toContainText("Aluguel");
});

test("sem sessão: áreas protegidas voltam às Boas-vindas e a API responde 401", async ({ page, request }) => {
  for (const rota of ["/contas", "/metas", "/resumo", "/ajustes", "/extrato", "/gastar", "/receber", "/metas/nova"]) {
    await page.goto(rota);
    await expect(page, rota).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Você recebe. O Finança diz quanto separar." }), rota).toBeVisible();
  }
  expect((await request.get("/api/dashboard?periodo=semana")).status()).toBe(401);
  expect((await request.post("/api/onboarding/claim", { data: {} })).status()).toBe(401);

  // As páginas públicas continuam abertas.
  for (const rota of ["/onboarding", "/entrar", "/termos", "/privacidade"]) {
    await page.goto(rota);
    await expect(page, rota).toHaveURL(rota);
  }
});
