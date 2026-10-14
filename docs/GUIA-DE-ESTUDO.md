# Guia de estudo do Finança

Este guia usa o próprio projeto como material de estudo. Ele foi escrito para quem está aprendendo a programar: explica **o que cada parte faz, por que foi feita assim e como você pode treinar mexendo nela**.

> Leia com o editor aberto ao lado. Cada seção aponta arquivos reais. A melhor forma de aprender é: ler → rodar → quebrar de propósito → consertar.

---

## 0. Antes de tudo

### O que é o projeto

Um assistente financeiro pessoal para celular. A frase que resume tudo:

> **"Você recebe. O Finança diz quanto separar."**

Você informa quanto recebeu e o app divide o dinheiro entre **contas fixas** (aluguel), **gasto do dia a dia**, **metas** (viagem, reserva) e **folga**, explicando o motivo de cada valor.

### Números do projeto

- ~6.200 linhas em ~100 arquivos de código (TypeScript, React, CSS, SQL via Prisma).
- 41 testes unitários + 8 testes ponta a ponta.
- 7 arquivos de *Server Actions*, 18 componentes de cliente.

### Como rodar (faça isso primeiro)

```bash
npm install
npm run db:push        # cria as tabelas do banco
npm run db:seed        # dados de exemplo (apaga o usuário atual!)
npm run dev            # abre em http://localhost:3000
npm test               # testes unitários (rápidos)
npm run e2e            # testes de navegador (mais lentos)
```

> Se `prisma generate` der erro `EPERM` no Windows, **pare o `npm run dev`** e tente de novo: o servidor trava um arquivo do Prisma.

### Glossário rápido

| Termo | Significado simples |
|---|---|
| **Frontend** | O que aparece na tela (React). |
| **Backend** | O que roda no servidor e fala com o banco. |
| **Componente** | Um pedaço reutilizável de tela (ex.: `Button`). |
| **Server Component** | Componente que roda no servidor e pode ler o banco direto. |
| **Client Component** | Componente que roda no navegador (`"use client"`), para interação. |
| **Server Action** | Função do servidor que a tela chama (`"use server"`). |
| **ORM (Prisma)** | Ferramenta que deixa você usar o banco com código TypeScript em vez de SQL. |
| **Função pura** | Mesma entrada → sempre a mesma saída, sem efeitos colaterais. |
| **Teste unitário** | Testa uma função isolada. |
| **Teste e2e** | Um navegador de verdade usa o app do começo ao fim. |

---

## 1. A ideia mais importante: camadas

```
Tela (React)  →  Server Action  →  Serviço  →  Motor (puro)  +  Banco (Prisma)
```

| Camada | Pasta | Responsabilidade | Não deve… |
|---|---|---|---|
| **Motor** | `lib/engine/` | Fazer as contas. | Saber de tela ou banco. |
| **Serviços** | `lib/services/` | Ler/gravar no banco e chamar o motor. | Conter HTML/JSX. |
| **Actions** | `app/**/actions.ts` | Porta de entrada: validar e delegar. | Ter regra de negócio pesada. |
| **Telas** | `app/`, `components/` | Mostrar e coletar dados. | Fazer conta de dinheiro. |

### Por que separar?

1. **Testar fica fácil.** O motor tem testes sem abrir navegador nem banco.
2. **Trocar peças fica barato.** Trocar SQLite por Postgres mexe só em `prisma/` e `lib/db.ts`.
3. **Reuso.** O futuro "chat" (V2) vai chamar os mesmos serviços que as telas chamam.
4. **Menos bugs.** Cada coisa tem um lugar único.

> 🧠 **Regra de bolso:** se você está escrevendo uma conta de dinheiro dentro de um componente React, provavelmente ela pertence ao `lib/engine/`.

---

## 2. Roteiro de leitura (do mais fácil ao mais difícil)

| # | Arquivo | O que você aprende |
|---|---|---|
| 1 | `lib/money.ts` | Por que dinheiro é guardado em **centavos inteiros**. |
| 2 | `lib/engine/types.ts` | Como modelar dados com `interface`. |
| 3 | `lib/engine/goals.ts` | Uma regra pequena e pura. |
| 4 | `lib/engine/distribute.ts` | O coração do app. |
| 5 | `tests/engine/distribute.test.ts` | Testes como **especificação**. |
| 6 | `prisma/schema.prisma` | Como o banco é descrito. |
| 7 | `lib/services/income.ts` | Ler → calcular → gravar, tudo em transação. |
| 8 | `app/receber/actions.ts` | Server Actions e validação. |
| 9 | `app/(app)/contas/page.tsx` | Server Component lendo dados. |
| 10 | `app/receber/ReceberFlow.tsx` | Client Component com estado. |
| 11 | `e2e/jornada.spec.ts` | O app inteiro como roteiro de teste. |

---

## 3. Lição: dinheiro em centavos (`lib/money.ts`)

Em JavaScript, `0.1 + 0.2` dá `0.30000000000000004`. Em finanças isso é inaceitável.

**Solução:** guardar tudo como **inteiro de centavos**. €23,50 vira `2350`. Só na hora de mostrar chamamos `formatEUR(2350)` → `"€23,50"`.

```ts
const total = 1000 + 2350;       // sempre exato (inteiros)
formatEUR(total);                // "€33,50"
```

✏️ **Exercício 1 (fácil):** abra `tests/money.test.ts`, adicione um teste para `formatEUR(100000)` esperando `"€1.000"`. Rode `npm test`.

---

## 4. Lição: o motor puro (`lib/engine/`)

### 4.1 O que é "puro"

`distribute(...)` recebe dados e devolve um resultado. **Não lê banco, não lê relógio, não altera o que recebeu.** Por isso a *simulação* ("Ver distribuição") nunca mexe nos saldos: ela só calcula. Só o "Confirmar" grava.

O teste `caso 5` prova isso congelando o objeto de entrada (`deepFreeze`): se o motor tentasse alterá-lo, o teste falharia.

### 4.2 A ordem fixa de prioridade

```
recebido → 1) contas fixas → 2) gasto da semana → 3) metas (por prioridade) → 4) folga
```

`Livre para gastar = gasto da semana + folga`.

### 4.3 Datas como texto (`"2026-10-08"`)

O motor usa strings `yyyy-mm-dd` em vez de `Date`. Isso evita o clássico bug de **fuso horário** e deixa as funções previsíveis. O motor **nunca** chama `new Date()`; quem chama diz "hoje".

### 4.4 O ciclo de uma conta (`lib/engine/bills.ts`)

É o trecho mais interessante para estudar, porque modela **o tempo**:

```
Guardando ──vence──▶ A confirmar ──paguei──▶ Paga
                          │
                          └──não paguei / parcial──▶ Em atraso ──paguei──▶ Paga
```

Funções principais:

| Função | O que faz |
|---|---|
| `settleBill` | Quando o vencimento passa, **retém** o guardado e zera o novo ciclo. |
| `pendingDue` / `openDue` | Descobre se há um vencimento esperando resposta. |
| `payBill` | Aplica a resposta do usuário ("paguei tudo / outro valor / ainda não"). |
| `planBill` | Quanto separar de um recebimento para essa conta. |

> 💡 **Decisão de design:** o app **não adivinha** se você pagou; **pergunta**. Adivinhar silenciosamente falsifica os saldos. Isso está explicado em `docs/DECISIONS.md`.

### 4.5 Fórmulas calibradas por casos reais

O brief original trazia números exatos (ex.: "recebendo €500 o livre é €246"). A fórmula literal não fechava todos os casos, então foi **calibrada até os 6 casos passarem**. Leia `docs/DECISIONS.md` (seção "Fase 2") para ver o raciocínio.

> 🧠 **Aprendizado:** testes escritos a partir de exemplos reais são um **contrato**. Se uma mudança quebra um, você sabe na hora.

✏️ **Exercício 2 (médio):** em `lib/engine/goals.ts`, `suggestWeekly` sugere um valor semanal de meta sem prazo (alvo ÷ 16, arredondado a €5). Mude para 20 semanas e veja quais testes quebram. Por quê?

---

## 5. Lição: banco de dados (`prisma/schema.prisma`)

### 5.1 Qual banco

**SQLite**, um arquivo só: `prisma/dev.db`. Perfeito para estudar (não precisa instalar nada). Para produção real, troque por Postgres.

Ver e editar dados na mão:

```bash
npx prisma studio
```

### 5.2 As tabelas

| Tabela | Guarda |
|---|---|
| `User` | Nome, gasto semanal, dia de início da semana. |
| `Bill` | Conta fixa: valor, dia, saldo guardado, estado do ciclo. |
| `Goal` | Meta: alvo, saldo, prazo, prioridade. |
| `Transaction` | Cada movimentação: `income`, `expense`, `allocation`, `withdrawal`, `bill_payment`. |

### 5.3 Ideias que valem ouro

1. **Não guardar o que dá para calcular.** O "livre da semana" não existe no banco; é derivado das transações (`weekStats` em `lib/services/state.ts`). Assim nunca fica desatualizado.
2. **`groupId` liga um recebimento às suas alocações.** É isso que permite o extrato mostrar "para onde foi cada euro".
3. **`note` guarda o nome** do destino, para o extrato continuar legível mesmo se você excluir a conta depois.
4. **Transação atômica (`db.$transaction`)**: ou grava **tudo**, ou **nada**. Veja `confirmIncome` em `lib/services/income.ts`.

### 5.4 Convenções usadas na coluna `category`

| Valor | Significa |
|---|---|
| `conta` / `meta` | Alocação vinda de um recebimento. |
| `manual` | Dinheiro movido à mão pelo usuário (Guardar/Retirar). |
| `Conta` | Parte de um pagamento de conta que não estava guardada (saiu do livre). |

> ⚠️ Isso é um **atalho** (usar um campo de texto para marcar tipos). Funciona, mas o ideal seria um campo próprio. Ótimo tema de refatoração (veja exercícios).

✏️ **Exercício 3 (médio):** abra o Prisma Studio, olhe a tabela `Transaction` depois de um "Recebi". Quantas linhas foram criadas? Qual `groupId` elas dividem?

---

## 6. Lição: Next.js 16

### 6.1 Server vs Client Components

- Por padrão, a página roda **no servidor** e lê o banco direto. Exemplo: `app/(app)/contas/page.tsx`.
- Só vira `"use client"` o que precisa de interação (cliques, estado, teclado): `ReceberFlow`, `ConfirmPayment`, `MoveMoney`, formulários.

> 🧠 **Regra de bolso:** comece no servidor; vire cliente só quando precisar de `useState`/eventos.

### 6.2 Server Actions (`"use server"`)

A tela chama uma função que roda no servidor. Exemplo: `app/receber/actions.ts`.

Duas regras de segurança que o projeto segue:
1. **Valide sempre** (`lib/validate.ts`): qualquer um pode chamar uma action por requisição direta.
2. **O cliente nunca dita os números.** `confirmIncome` **recalcula** a distribuição no servidor.

### 6.3 `ActionResult`: erros como valor

Em produção, o Next **esconde a mensagem** de erros lançados em Server Actions. Por isso regras de negócio ("sem livre suficiente") voltam como valor:

```ts
type ActionResult = { ok: true } | { ok: false; error: string };
```

A tela mostra `result.error`. Veja `lib/result.ts` e `components/MoveMoney.tsx`.

### 6.4 Cache Components: dinâmico vs estático

O projeto liga `cacheComponents` em `next.config.ts`. Regras que você viu na prática:

| Situação | O que fazer |
|---|---|
| Ler banco numa página | Dentro de `<Suspense>`, com `await connection()` antes. |
| "Data de hoje" no servidor | Usar `serverToday()` (`lib/services/today.ts`). |
| `new Date()` em Client Component | Só dentro de `<Suspense>` ou em handlers de evento. |
| `usePathname()` em rota dinâmica | Dentro de `<Suspense>` (veja `app/(app)/layout.tsx`). |

### 6.5 Estrutura de pastas especial

- `(app)/` é um **route group**: agrupa telas (com barra de navegação) sem aparecer na URL.
- `contas/[id]/page.tsx`: `[id]` é um **parâmetro**. No Next 16, `params` é uma `Promise` (`await params`).
- Telas de fluxo (`/receber`, `/gastar`, `/extrato`) ficam fora do grupo: tela cheia, sem menu.

✏️ **Exercício 4 (médio):** crie uma página `/sobre` simples. Depois mova-a para dentro de `(app)/` e veja a barra de navegação aparecer sem mudar a URL.

---

## 7. Lição: React na prática

Veja `components/MoveMoney.tsx` (82 linhas, bom para estudar):

- `useState`: guarda o que o usuário digita e qual botão foi tocado.
- `useTransition`: mostra "Salvando…" enquanto a Server Action roda.
- **Componente controlado**: o campo de valor mostra o que está no estado.
- **Renderização condicional**: `if (!direction) return <botões/>` e senão o formulário.

Padrão que se repete (e merece ser entendido):

```ts
startTransition(async () => {
  const result = await minhaAction(...);
  if (!result.ok) return setError(result.error);
  // sucesso: limpa o estado
});
```

> ⚠️ **Pegadinha real:** `redirect()` dentro de uma action "lança" um erro especial (`NEXT_REDIRECT`). Por isso alguns `catch` fazem `if (e.message.startsWith("NEXT_REDIRECT")) throw e;`. Se engolir esse erro, a navegação não acontece.

---

## 8. Lição: TypeScript no projeto

| Recurso | Onde ver | Para quê |
|---|---|---|
| `interface` | `lib/engine/types.ts` | Descrever a forma dos dados. |
| **União discriminada** | `StatementEntry` em `lib/statement.ts` | Vários formatos distinguidos por `kind`. |
| `Pick`, `Partial` | `tests/engine/fixtures.ts` | Montar dados de teste sem repetir tudo. |
| Tipo `Cents` | `lib/money.ts` | Documentar que o número é em centavos. |

Exemplo de união discriminada (muito útil):

```ts
type StatementEntry =
  | { kind: "income"; amountCents: number; lines: StatementLine[] }
  | { kind: "expense"; amountCents: number; category: string }
  | { kind: "movement"; amountCents: number; label: string };

// O TypeScript "entende" cada caso depois de checar `kind`:
if (e.kind === "income") e.lines;   // ✅ existe só aqui
```

---

## 9. Lição: interface e design

- **Tokens de design** em `app/globals.css` (`--color-brand`, `--radius-card`…). Os componentes usam só nomes como `bg-brand` e `text-muted`: **nenhuma cor solta**. Mudar a identidade visual = editar um arquivo.
- **Componentes pequenos** em `components/ui/`: `Button`, `Chip`, `MoneyField`, `ProgressBar`.
- **Acessibilidade**: alvos de toque de 44px, `aria-label`, `role="alert"`, extrato com `<details>` nativo (funciona sem JavaScript).
- **Mobile-first**: layout de ~390px, centralizado em telas grandes.

✏️ **Exercício 5 (fácil):** mude `--color-brand` para outra cor e veja o app inteiro mudar.

---

## 10. Lição: testes (o que dá segurança para mudar)

### Dois níveis que se complementam

| | Unitário (Vitest) | Ponta a ponta (Playwright) |
|---|---|---|
| Onde | `tests/` | `e2e/` |
| Velocidade | Milissegundos | Segundos |
| Testa | Uma função isolada | O app inteiro num navegador |
| Aponta | **Onde** quebrou | Se as peças **funcionam juntas** |

### Boas práticas que aparecem aqui

1. **Testes como especificação.** `distribute.test.ts` tem os "casos" do brief com os números exatos.
2. **Fixtures** (`tests/engine/fixtures.ts`): funções que montam dados de teste.
3. **Testar também o que *não* pode acontecer** (ex.: a simulação não altera o estado).
4. **Seletores por papel/acessibilidade** no e2e (`getByRole("button", { name: "Confirmar" })`) em vez de classes CSS.

### Erros reais que os testes pegaram

| O que aconteceu | Lição |
|---|---|
| Conta recém-criada aparecia como "considerado pago". | Modelar o **tempo** é difícil: faltava `createdAt`. |
| Testes quebraram quando o dia do mês mudou. | Teste que depende de "hoje" é frágil. Fixe valores que funcionem sempre. |
| Cartão "Você pagou?" ficava preso no modo "digitar valor" após pagamento parcial. | Estado de UI precisa ser **resetado** após sucesso. |
| Elementos de telas anteriores ficavam ocultos no DOM. | O `<Activity>` do Cache Components mantém rotas antigas; use `:visible`. |

> 🧠 **Hábito valioso:** quando um teste falha, pergunte primeiro: *o app está errado ou o teste está errado?* Aqui foi os dois, em momentos diferentes.

---

## 11. Lição: PWA (app instalável)

- `app/manifest.ts` + ícones em `public/icons/` tornam o site **instalável** no celular.
- `public/sw.js` é um **service worker** mínimo: só mostra uma página offline.
- **Decisão importante:** dados financeiros **não** ficam em cache (mostrariam saldo desatualizado).

---

## 12. Como o desenvolvimento foi conduzido (processo)

Esse é o hábito que mais separa iniciantes de quem desenvolve bem:

1. **Entender o problema** (`Claude/tasks.md` + telas de referência em `docs/design/`).
2. **Modelar os dados** antes de escrever telas (`schema.prisma`).
3. **Escrever a lógica pura primeiro**, com testes (`lib/engine/`).
4. **Criar os serviços** que juntam banco + motor.
5. **Construir as telas** em cima dos serviços.
6. **Testar o fluxo inteiro** (e2e) e **olhar a tela de verdade** (screenshots).
7. **Registrar decisões** em `docs/DECISIONS.md`, porque o *porquê* some da memória rápido.

---

## 13. Fluxo completo: "Recebi €500" (acompanhe no código)

1. `app/receber/ReceberFlow.tsx` (cliente) junta o valor pelo teclado de `components/ui/Keypad.tsx`.
2. "Ver distribuição" chama `simulateIncomeAction` (`app/receber/actions.ts`).
3. A action valida e chama `simulateIncome` (`lib/services/income.ts`).
4. O serviço faz `loadState()` (lê o banco) e `distribute()` (motor puro). **Nada é gravado.**
5. A tela mostra o resultado. "Confirmar" chama `confirmIncomeAction`.
6. `confirmIncome` **recalcula** e grava, numa única transação: a receita, cada alocação, os novos saldos e a retirada da reserva (se houver).
7. A action chama `revalidatePath` e `redirect("/")`.
8. O Início aparece com o novo extrato.

✏️ **Exercício 6 (difícil):** coloque `console.log` em cada passo e acompanhe a ordem no terminal e no navegador. Quais logs aparecem no **servidor** e quais no **navegador**? Por quê?

---

## 14. Pegadinhas e como não cair nelas

| Pegadinha | Como evitar |
|---|---|
| Usar `float` para dinheiro | Sempre centavos inteiros. |
| `new Date()` espalhado pelo código | Passar "hoje" como parâmetro. |
| Regra de negócio dentro de componente | Mover para `lib/engine/`. |
| Confiar no que o cliente envia | Validar e **recalcular** no servidor. |
| Lançar erro para regra de negócio numa action | Devolver `ActionResult`. |
| Alterar saldo direto | Mover dinheiro por **transação**, para o extrato fechar. |
| `catch` que engole `NEXT_REDIRECT` | Relançar esse erro. |
| Teste que depende da data de hoje | Fixar valores que funcionem em qualquer data. |
| Rodar `prisma generate` com o dev aberto (Windows) | Parar o `npm run dev` antes. |

---

## 15. Limitações conhecidas (e onde você pode melhorar)

1. **Sem login.** Há um usuário local único. O modelo já tem `userId`; adicionar autenticação é o próximo passo natural.
2. **Só o vencimento mais recente fica "a confirmar".** Se outro passar sem resposta, o anterior fecha em silêncio.
3. **`category` serve de marcador de tipo.** Funciona, mas um campo próprio (`source`) seria mais limpo.
4. **SQLite** serve para estudo; para várias pessoas use Postgres.
5. **Moeda única (EUR)** e idioma fixo.
6. **Duas confirmações simultâneas** podem duplicar movimentos; um identificador de operação evitaria isso.
7. `ReceberFlow.tsx` (293 linhas) mistura três telas e poderia ser dividido.
8. **Falta CI** (rodar testes a cada commit) e o histórico git ainda tem um único commit.

---

## 16. Plano de exercícios (do fácil ao difícil)

### 🟢 Nível 1: mexendo sem medo
- [ ] Mude a cor da marca (`--color-brand` em `app/globals.css`).
- [ ] Adicione a categoria "Lazer" em `lib/categories.ts` e veja onde aparece.
- [ ] Mude o texto do botão "Paguei tudo" em `components/ConfirmPayment.tsx`.
- [ ] Rode `npx prisma studio` e explore as 4 tabelas.

### 🟡 Nível 2: entendendo as peças
- [ ] Escreva um teste novo em `tests/money.test.ts`.
- [ ] Mude `suggestWeekly` (de 16 para 20 semanas) e conserte os testes que quebrarem.
- [ ] Faça o extrato geral mostrar só gastos, com um filtro simples.
- [ ] Adicione um campo `notes` à conta (schema → `db push` → formulário).

### 🟠 Nível 3: regra de negócio
- [ ] Escreva o teste **antes**: "recebi €0 não pode ser confirmado". Depois faça passar.
- [ ] Faça o aviso "Vence em N dias" aparecer a partir de 10 dias (hoje são 7).
- [ ] Crie o tipo de meta "recorrente" (ex.: guardar €50 todo mês, sem alvo final).

### 🔴 Nível 4: refatoração e arquitetura
- [ ] Substitua o uso de `category` como marcador por um campo `source` (`"income" | "manual" | "shortfall"`), com migração dos dados.
- [ ] Divida `ReceberFlow.tsx` em três componentes menores sem quebrar o e2e.
- [ ] Registre **todos** os vencimentos pendentes (não só o mais recente).
- [ ] Adicione autenticação (cada usuário vê só os seus dados).

### ⚫ Nível 5: projeto próprio
- [ ] Rode um segundo `User` com dados separados.
- [ ] Troque SQLite por Postgres (só `schema.prisma` e `.env`).
- [ ] Implemente os **Fundos por país** (V2), reaproveitando o `fundId` já reservado no modelo.

---

## 17. Como estudar com este projeto (um método)

1. **Rode e use o app** antes de ler código. Entenda o que ele faz como usuário.
2. **Leia na ordem do roteiro** (seção 2), sempre de baixo para cima: dados → lógica → telas.
3. **Quebre de propósito.** Mude um número no motor e veja qual teste falha. É o jeito mais rápido de entender uma regra.
4. **Escreva o teste antes do código** ao menos uma vez (exercício do nível 3).
5. **Leia os erros.** As mensagens do Next, do TypeScript e do Playwright costumam dizer exatamente o que fazer.
6. **Anote decisões.** Ao mudar algo importante, acrescente uma linha em `docs/DECISIONS.md`: *o quê* e *por quê*.
7. **Use git.** Faça um commit pequeno a cada exercício; se errar, volta atrás.

### O que pesquisar depois (temas, nesta ordem)

1. JavaScript moderno e **TypeScript** (tipos, interfaces, uniões).
2. **React**: estado, efeitos, componentes controlados.
3. **Next.js (App Router)**: Server/Client Components, Server Actions, rotas.
4. **Prisma e SQL básico**: tabelas, relações, transações.
5. **Testes**: Vitest e Playwright; "testar comportamento, não implementação".
6. **Acessibilidade web** (WCAG): rótulos, contraste, foco, teclado.
7. **Git e GitHub**: branches, commits, Pull Requests.

---

## 18. Mapa rápido de arquivos

```
app/
  onboarding/        4 passos de configuração (rascunho no cliente; só o final grava)
  (app)/             Início, Contas, Metas, Ajustes (com barra de navegação)
    actions.ts       guardar/retirar dinheiro à mão
    contas/          lista, detalhe com extrato, editar, nova, "Você pagou?"
    metas/           lista, detalhe com extrato, editar, nova, prazo vencido
  receber/ gastar/   fluxos de tela cheia
  extrato/           extrato completo
components/          peças de tela reutilizáveis (ui/ = botões, campos, barras)
lib/
  engine/            MOTOR PURO (contas, ciclos, datas, distribuição)
  services/          banco + motor (income, bills, goals, history, home…)
  statement.ts       montagem pura dos extratos
  money.ts amount.ts dinheiro e teclado numérico
  validate.ts        validação das entradas das actions
  result.ts          ActionResult (erros como valor)
prisma/              schema do banco (SQLite) e seed
tests/               unitários (Vitest)
e2e/                 navegador (Playwright)
docs/                DECISIONS.md (o "porquê") e este guia
public/              manifest, ícones, service worker, página offline
```

> Quando estiver perdido, volte ao mapa e pergunte: **em qual camada esse problema mora?**
