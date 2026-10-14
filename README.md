# Finança

> **Você recebe. O Finança diz quanto separar.**

Assistente financeiro pessoal, mobile-first (PWA). Você informa quanto recebeu e o app distribui o dinheiro entre contas fixas, gasto do dia a dia e metas, explicando o motivo de cada valor. Moeda: EUR. Interface em português do Brasil.

## Como rodar

Requisitos: Node 22+.

```bash
npm install
echo 'DATABASE_URL="file:./dev.db"' > .env   # banco SQLite (fica em prisma/dev.db)
npm run db:push                               # cria as tabelas
npm run db:seed                               # opcional: dados de exemplo (apaga o usuário atual!)
npm run dev                                   # http://localhost:3000
```

Sem o seed, o app abre direto no onboarding. Depois de instalar, o `postinstall` gera o Prisma Client.

| Script | O que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` / `npm start` | build e servidor de produção (o service worker só é registrado em produção) |
| `npm test` | testes unitários (Vitest): motor de distribuição, dinheiro, teclado, datas |
| `npm run e2e` | testes ponta a ponta (Playwright, Chromium mobile) |
| `npm run lint` | ESLint |
| `npm run db:push` / `db:seed` | aplica o schema / popula com o estado de exemplo |

Na primeira vez: `npx playwright install chromium`.

Os testes e2e rodam uma **build de produção** em outro diretório (`.next-e2e`), na porta 3100 e com banco próprio (`prisma/e2e.db`), então não interferem em um `npm run dev` aberto nem nos seus dados.

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
  onboarding/        4 passos (rascunho no cliente; só "Começar a usar" grava)
  (app)/             Início, Contas, Metas, Ajustes (+ navegação inferior)
  receber/ gastar/   fluxos de tela cheia
lib/
  engine/            motor PURO (sem UI/banco): distribute, bills, goals, dates
  services/          camada de operações (o chat da V2 deve chamar estas funções)
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
