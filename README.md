# Finança

> **Você recebe. O Finança diz quanto separar.**

Assistente financeiro pessoal, mobile-first (PWA). Você informa quanto recebeu e o app distribui o dinheiro entre contas fixas, gasto do dia a dia e metas, explicando o motivo de cada valor. Moeda: EUR. Interface em português do Brasil.

## Como rodar

Requisitos: Node 22+.

```bash
npm install
cp .env.example .env     # preencha DATABASE_URL e BETTER_AUTH_SECRET (veja "Login e contas")
npm run db:push          # cria as tabelas (banco SQLite em prisma/dev.db)
npm run dev              # http://localhost:3000
```

O app agora exige **login**: quem não está logado vê as Boas-vindas, faz o onboarding sem cadastro e só então salva o plano numa conta. Em desenvolvimento o código de login **aparece no terminal** do `npm run dev` (não precisa de e-mail nem de Google). Depois de instalar, o `postinstall` gera o Prisma Client.

> `npm run db:seed` e `db:seed:resumo` criam dados de exemplo para o usuário "legado" e **apagam os usuários existentes**: use `DATABASE_URL=file:./demo.db`.

| Script | O que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` / `npm start` | build e servidor de produção (o service worker só é registrado em produção) |
| `npm test` | testes unitários (Vitest): motor de distribuição, dinheiro, teclado, datas |
| `npm run e2e` | testes ponta a ponta (Playwright, Chromium mobile) |
| `npm run lint` | ESLint |
| `npm run db:push` / `db:seed` | aplica o schema / popula com o estado de exemplo |
| `npm run db:prepare-login` | prepara um banco criado ANTES do login (veja "Dados de antes do login") |
| `npm run claim-legacy -- --email voce@email.com` | transfere os dados de antes do login para a sua conta |

Na primeira vez: `npx playwright install chromium`.

Os testes e2e rodam uma **build de produção** em outro diretório (`.next-e2e`), na porta 3100 e com banco próprio (`prisma/e2e.db`), então não interferem em um `npm run dev` aberto nem nos seus dados.

## Login e contas

Cada pessoa tem os **seus próprios dados** (contas fixas, metas, transações, ajustes e configurações) e nunca vê nem altera os de outra. Entrar é **sem senha**: código de 6 dígitos por e-mail (vale 10 minutos, 5 tentativas), Google e, opcionalmente, passkey (Face ID/digital). O Apple está pronto, mas desligado.

### Variáveis de ambiente (`.env`; modelo em `.env.example`)

| Variável | Para quê | Como obter |
| --- | --- | --- |
| `DATABASE_URL` | banco SQLite | `file:./dev.db` |
| `BETTER_AUTH_SECRET` | assina as sessões (obrigatória em produção) | `openssl rand -base64 32` (ou `npx @better-auth/cli secret`) |
| `BETTER_AUTH_URL` | endereço público do app (cookies, passkeys) | local: `http://localhost:3000`; produção: `https://seu-dominio.com` (em https os cookies saem com `Secure`) |
| `AUTH_TRUSTED_ORIGINS` | outras origens aceitas, separadas por vírgula | opcional: o IP da rede para abrir no celular, ex. `http://192.168.0.10:3000` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | "Continuar com Google" | [Google Cloud Console](https://console.cloud.google.com) → APIs e serviços → Credenciais → ID do cliente OAuth ("Aplicativo da Web"), com o URI de redirecionamento `<BETTER_AUTH_URL>/api/auth/callback/google`. Sem elas, o botão não aparece |
| `AUTH_APPLE_ENABLED` / `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` | "Continuar com Apple" | **desligado** (`false`). Exige conta Apple Developer (paga): Services ID e segredo JWT. Para ligar: `AUTH_APPLE_ENABLED=true` |
| `RESEND_API_KEY` / `EMAIL_FROM` | envio do código em **produção** | [resend.com](https://resend.com) → API Keys; `EMAIL_FROM` precisa ser de um domínio verificado lá |

Sem `RESEND_API_KEY`, o código só aparece no terminal (desenvolvimento). Os testes e2e usam variáveis próprias (`EMAIL_TRANSPORT=file`, `AUTH_RATE_LIMIT=off`, `AUTH_OTP_MIN_GAP_SECONDS=0`), definidas no `playwright.config.ts` — **nunca use essas em produção**.

### Como o isolamento funciona

- O `userId` vem **sempre da sessão no servidor** (`requireUser()` em `lib/auth/session.ts`), nunca do corpo da requisição, da URL ou do cliente.
- **Só `lib/services` e `lib/auth` falam com o Prisma** (regra de lint `no-restricted-imports`). Toda função de serviço recebe o `userId` e filtra por ele em todo `where`, inclusive em `update`/`delete`. Registro de outra pessoa = "não encontrado" (404, nunca 403).
- O `proxy.ts` (Next 16) só faz um redirecionamento rápido por cookie; **cada página, ação e rota valida a sessão de verdade**.
- `tests/isolation.test.ts` cria dois usuários e confirma que B nunca lê nem altera dados de A em cada operação.

### Dados de antes do login (usuário "legado")

Se você já usava o app antes do login, seus dados estão num usuário único. Para não perdê-los:

1. **Faça uma cópia do banco** (`prisma/dev.db`).
2. `npm run db:prepare-login` (dá a esse usuário o e-mail provisório `legado@financa.local`; é seguro rodar de novo) e depois `npm run db:push`.
3. Suba o app (`npm run dev`), **entre uma vez** com o seu e-mail (a conta nova nasce vazia).
4. `npm run claim-legacy -- --email voce@email.com` transfere tudo para essa conta e apaga o usuário legado. O comando recusa transferir para uma conta que já tem plano (nunca mistura dados).

## Como funciona

**Conta fixa ≠ Gasto semanal ≠ Meta ≠ Transação.** A cada recebimento o motor aplica uma ordem fixa:

1. **Contas fixas** — sempre primeiro. Um mês = 4 parcelas semanais; a alocação é `falta / pagamentos restantes`, arredondada para euros.
2. **Gasto da semana** — reserva o valor do dia a dia.
3. **Metas** — na ordem de prioridade (com prazo: `falta / semanas até o prazo`; sem prazo: o valor semanal definido).
4. **Folga** — o que sobra. `Livre para gastar = dia a dia + folga`.

Se o dinheiro não dá para tudo, as contas são cobertas primeiro, as últimas metas ficam pausadas e o app oferece usar a reserva de emergência ou seguir com menos. Uma **simulação** nunca altera saldos; só "Confirmar" grava.

Valores são sempre **centavos inteiros**. Os números das telas de referência (`docs/design/`) estão reproduzidos como testes em `tests/engine/`.

## Estrutura

```
app/
  bem-vindo/ entrar/ Boas-vindas e "Salve seu plano / Entrar" (código, nome, passkey)
  onboarding/        4 passos sem login (rascunho no aparelho; só vira dados da conta depois do login)
  (app)/             Início, Contas, Metas, Resumo, Ajustes (+ Conta) e navegação inferior
  receber/ gastar/   fluxos de tela cheia
  api/               auth (Better Auth), dashboard, onboarding/claim, account/export
lib/
  engine/            motor PURO (sem UI/banco): distribute, bills, goals, dates
  auth/              Better Auth, sessão (requireUser), e-mail do código, limite por e-mail
  services/          camada de operações (o chat da V2 deve chamar estas funções); único lugar com o Prisma
  money.ts amount.ts formatação e entrada de valores
prisma/              schema SQLite e seed
tests/ e2e/          Vitest e Playwright
docs/DECISIONS.md    decisões em pontos ambíguos (leia antes de mexer no motor)
```

## Notas

- Sem autenticação no MVP: um único usuário local. O modelo já tem `userId` (e `fundId` reservado para os Fundos da V2).
- O projeto usa Next 16 com **Cache Components**: leituras do banco são dinâmicas e ficam dentro de `<Suspense>`; datas "de hoje" vêm de `serverToday()`.
- PWA: `app/manifest.ts`, ícones em `public/icons/`, e um service worker mínimo (`public/sw.js`) que só serve uma página offline — dados financeiros nunca ficam em cache.
- Fora do escopo do MVP (V2): chat em linguagem natural, Fundos por país, Open Banking, notificações, múltiplas moedas e relatórios.
