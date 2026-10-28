# Relatório de limpeza e refatoração — Finança

Branch: `chore/limpeza-refatoracao` (criada a partir de `feat/resumo`, que contém o commit do dashboard Resumo).
Etapa 1 (diagnóstico, só leitura). **Nenhum arquivo do projeto foi alterado**, só este relatório foi criado.

## 0. Premissas do prompt que não batem com o projeto

| O prompt diz | O projeto tem | Consequência |
|---|---|---|
| Better Auth (User, Session, Account, Verification, Passkey) | **Nenhuma autenticação.** Usuário único local (`getOrCreateUser` = primeiro usuário do banco). Schema só tem `User`, `Bill`, `Goal`, `Transaction`. | Itens de "verificar a sessão em toda rota/action" não se aplicam; ver §6 (segurança). |
| Migrações do Prisma já aplicadas | **Não há pasta `prisma/migrations`.** O projeto usa `prisma db push`. | A regra "mudanças no schema viram migração nova" não se aplica; qualquer mudança de schema seria um `db push` e só com sua aprovação. |
| `.env.example` | **Não existe.** Só `.env` (ignorado pelo git) com `DATABASE_URL`. | Nada a comparar; sugiro criar um `.env.example` (ver R-8). |
| Cobertura de testes, se houver | **Não há provedor de cobertura** (`@vitest/coverage-v8` não está instalado). | Não consegui medir cobertura. Ver pergunta Q4. |
| Componentes repetidos (teclado, card de valor, barra de progresso, chips) | `components/ui/` já tem `Button`, `Chip`, `Keypad`, `MoneyField`, `ProgressBar`: **não há teclado duplicado**. | Só sobra a duplicação de barras de progresso no Resumo (R-6). |

Vários "pontos que você espera ver resolvidos" **já estão resolvidos** (ver §7).

## 1. Estado inicial (medido nesta branch, commit `09a7a5f`)

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | 2 erros, ambos em `.next/types/validator.ts` (arquivo **gerado e antigo** que ainda aponta para `app/page.js`; é regenerado por `next dev`/`next build`). Nenhum erro em código-fonte. |
| `tsc --noUnusedLocals --noUnusedParameters` | **0 ocorrências** |
| ESLint | **0 erros, 0 avisos** |
| Vitest | **7 arquivos, 55 testes, todos passando** (inclui o teste de integração de isolamento com SQLite próprio) |
| Playwright (e2e) | 9 testes passando (rodados na sessão anterior) |
| `next build` | Compila; 20 páginas. Em 2 execuções o build parou no fim com um aviso de segurança do Next 16.4.0 e passou ao repetir o comando (ver §8). |
| Cobertura | **não medida** (sem provedor instalado) |

**Tamanho do código** (arquivos rastreados): 146 arquivos; 7.622 linhas de código (`.ts/.tsx/.css/.prisma/.mjs/.js`):
`app` 3.182 linhas / 52 arquivos · `lib` 2.302 / 39 · `tests` 744 / 9 · `e2e` 490 / 7 · `components` 603 / 13 · `prisma` 197 / 3.
**Dependências:** 9 de produção (`@dnd-kit/core|sortable|utilities`, `@prisma/client`, `next`, `prisma`, `react`, `react-dom`, `recharts`) e 11 de desenvolvimento.

**Bundles** (`.next-e2e`, build de produção; o Next 16 não imprime tamanho por rota, então medi pelos manifestos de cliente: JS específico da rota, sem os chunks compartilhados do framework):

| Rota | Chunks | JS bruto | JS gzip |
|---|---|---|---|
| `/metas` | 4 | 76 KB | 26 KB |
| `/onboarding` | 3 | 80 KB | 25 KB |
| `/resumo` (sem o Recharts, que carrega sob demanda) | 3 | 43 KB | 14 KB |
| `/receber` | 2 | 37 KB | 12 KB |
| `/metas/nova`, `/metas/[id]/editar` | 3 | 33 KB | 11 KB |
| `/contas`, `/contas/[id]`, `/` | 3 | 31–32 KB | 11 KB |
| `/metas/[id]`, `/contas/nova`, `/contas/[id]/editar`, `/ajustes` | 3 | 28–29 KB | 10 KB |
| `/gastar` | 2 | 27 KB | 9 KB |
| `/extrato` | 2 | 22 KB | 7 KB |

**Total de JS estático:** 1.142.331 B bruto (≈1.116 KB), 345.257 B gzip (≈337 KB), 29 arquivos. O maior chunk (287 KB) é o do Recharts, carregado só em `/resumo`.

## 2. Remoções

Resultado de `knip`, `tsc --noUnused*`, busca de env vars, assets, tokens do Tailwind, campos do Prisma, `console.log`, `TODO` e código comentado:

| Item | Tipo | Evidência | Risco | Ação proposta |
|---|---|---|---|---|
| `MIN_RECEBIMENTOS` (`lib/dashboard/index.ts`) | export | usado só no próprio arquivo | baixo | virar constante compartilhada (R-8), não remover |
| `livreDaSemana` (`lib/dashboard/ritmo.ts`) | export | usado só no próprio arquivo | baixo | vai ser reaproveitado em R-4, não remover |
| `MetaStatus` (`lib/dashboard/types.ts`) | tipo exportado | usado só no próprio arquivo | baixo | tirar o `export` (ou usar na UI) |
| `BASE`, `RECEBIDOS` (`tests/dashboard/fixtures.ts`) | exports | usados só no próprio arquivo | baixo | tirar o `export` (opcional; ganho mínimo) |

**Não há dependências, arquivos, assets, variáveis de ambiente, tokens, `console.log`, `TODO`, código comentado ou rascunhos sem uso.**
Todos os 18 tokens de cor do tema têm uso (`locked` 1, `chart-late` 1 são os menos usados), todos os 6 arquivos de `public/` são referenciados, e as 5 dependências de runtime (+ `@tailwindcss/turbopack` pelo `next.config.ts`) estão em uso.

## 3. Suspeitos (não mexer sem sua decisão)

| Item | Por que parece sem uso | Por que não removo |
|---|---|---|
| `public/sw.js` (knip: "arquivo não usado") | Ninguém o importa | **Falso positivo**: é registrado por string em `ServiceWorkerRegister.tsx` e servido via `next.config.ts` (PWA). |
| `Bill.fundId` e `Goal.fundId` (Prisma) | Nenhuma consulta lê ou grava | O próprio schema diz "reservado para os Fundos (V2)". Remover exige `db push` e descarta uma reserva intencional. **Recomendo manter.** |
| `WEEKS_PER_CYCLE`, `toISO`, `dueInMonth`, `weekdayIndex` (`lib/engine`) | knip: export não importado fora do módulo | Fazem parte da API pública do motor (`export *` em `lib/engine/index.ts`) e são usados internamente. **Recomendo manter.** |
| `prisma/dev.db.bak-20261014-1136` | Cópia de banco na pasta | Backup seu (ignorado pelo git). **Não toco.** |
| `docs/GUIA-DE-ESTUDO.md` (487 linhas) e `Claude/tasks.md` | Documentos longos | São referenciados por `DECISIONS.md`; fazem parte do material de estudo. |

## 4. Bug encontrado (fora do escopo, precisa de decisão)

**`lib/services/goals.ts:180`: a regex de prazo está sem a barra invertida** (`/^d{4}-…/` em vez de `/^\d{4}-…/`). Resultado: `resolveGoalDeadline` com a opção "Estender o prazo" **rejeita qualquer mês**, inclusive meses futuros válidos, sempre com a mensagem "Escolha um mês que ainda não passou." (confirmei: a regex atual devolve `false` para `2027-03`).
O e2e só testa o caso de um mês **passado**, que também falha com essa mensagem, então o teste passa por acaso e o bug não aparece.
Corrigir **muda comportamento** (de "sempre falha" para "funciona"), então não vou corrigir sem você decidir (pergunta Q2).

## 5. Refatorações (ordenadas por benefício ÷ risco)

Legenda de verificação: **E2E** = `npx playwright test`; **U** = `vitest`; **N** = novo teste de caracterização antes de mexer.

| # | Problema | Mudança proposta | Arquivos | Como verificar | Risco |
|---|---|---|---|---|---|
| R-1 | O padrão `try { await action } catch (e) { if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e; setError(...) }` está copiado **8 vezes em 7 arquivos**; o parágrafo de erro `<p role="alert" className="text-center text-sm text-warn-ink">` aparece **15 vezes**. | Um helper `runAction` (hook) e um componente `FormError` em `components/ui`. Mesmos textos de erro. | `ReceberFlow` (3×), `GastarFlow`, `BillForm`, `GoalForm`, `SettingsForm`, `StepPreview`, `components/ui/` | E2E completo (fluxos, jornada, contas-metas, onboarding) + comparar textos de erro | baixo |
| R-2 | `100_000_000` (teto de valor) repetido em `validate.ts`, `draft.ts` e `expense.ts`; regex de prazo `yyyy-mm` copiada em `validate.ts`, `draft.ts` e `goals.ts` (esta, com o bug do §4). | Constante `MAX_CENTS` e um `isDeadline()` únicos em `lib/validate.ts`. **A regex de `goals.ts` só muda se você aprovar a correção do §4.** | `lib/validate.ts`, `lib/draft.ts`, `lib/services/expense.ts`, `lib/services/goals.ts` | N (testes de `validate.ts`/`sanitizeDraft`, hoje sem teste) + U | baixo |
| R-3 | `getOrCreateUser()` é chamado em **22 pontos**; só a tela Início faz ~4 consultas `findFirst` iguais por requisição (`page`, `loadState`, `listBills`, `getStatement`). | Envolver em `cache()` do React para deduplicar por requisição. Mesmo resultado, menos consultas. | `lib/services/user.ts` | N (teste de integração com SQLite que conta as consultas) + E2E | baixo–médio (convive com `connection()` e Cache Components; validar no build) |
| R-4 | A fórmula do "livre da semana" (`recebido − guardado + retirado`) existe em **dois lugares**: `weekStats` (`lib/services/state.ts`) e `livreDaSemana` (`lib/dashboard/ritmo.ts`). | Uma função pura no motor (`lib/engine`), usada pelos dois. | `lib/services/state.ts`, `lib/dashboard/ritmo.ts`, `lib/engine/` | N (hoje `weekStats` **não tem teste**) + testes de ritmo existentes + E2E | baixo |
| R-5 | **Aritmética financeira no cliente**: `ReceberFlow` recalcula `toSave`, `free` e `living` ao ajustar valores; `GastarFlow` faz `freeLeft − cents` inline, embora `freeAfterExpense` já exista no motor (usada só em teste). O servidor sempre revalida, então é só pré-visualização. | Funções puras no motor (`previewAllocation`; reaproveitar `freeAfterExpense`) chamadas pelos componentes. Mesma exibição. | `app/receber/ReceberFlow.tsx`, `app/gastar/GastarFlow.tsx`, `lib/engine/distribute.ts` | N (unitários das fórmulas) + E2E `fluxos` (confere livre e sobra) | médio (UI visível, mas coberto por e2e) |
| R-6 | O Resumo tem **3 barras de progresso inline** (`MetasCard`, `CategoriasCard`, `CoberturaCard`) além de `components/ui/ProgressBar`. | Estender `ProgressBar` (cor da barra e marcador opcional) e usar nas 3. | `components/ui/ProgressBar.tsx`, 3 cards do Resumo | Screenshots em 390px antes/depois + E2E `resumo` | baixo |
| R-7 | Formatação de moeda em 3 lugares: `formatEUR` (centavos), `displayAmount` (texto digitado) e `` `€${v}` `` nos eixos dos 2 gráficos. | Helper único de rótulo de eixo; `displayAmount` mantém o algoritmo (não muda a saída). | `lib/money.ts`, `lib/amount.ts`, `RitmoChart`, `RecebimentosChart` | `tests/money.test.ts` e `tests/amount.test.ts` + visual | baixo (ganho pequeno) |
| R-8 | O mínimo de 3 recebimentos aparece como literal `3` na UI (`ResumoView`) e como `MIN_RECEBIMENTOS` no serviço. Também não há `.env.example`. | Constante em `lib/dashboard/types.ts` usada pelos dois; criar `.env.example` (`DATABASE_URL`). | `ResumoView.tsx`, `lib/dashboard/index.ts` | U + E2E `resumo` | baixo |

**Propostas que recomendo NÃO fazer** (custo maior que o benefício, ou fora do pedido):
- Extrair um `<Card>` para `rounded-card border border-line bg-surface` (≈50 usos): muita mudança de arquivo, ganho só estético.
- Renomear identificadores do Resumo de português para inglês: o contrato da API do dashboard foi definido em português; só registrar a convenção em `DECISIONS.md`.
- Corrigir as condições de corrida em `confirmBillPayment`, `moveBillMoney`, `moveGoalMoney` e `confirmIncome` (leitura fora da transação): muda comportamento sob concorrência, deve ser outra tarefa.

## 6. Segurança e fronteira servidor/cliente

- **Sessão:** não existe. Todos os serviços resolvem o usuário com `getOrCreateUser()` (o primeiro do banco). **O app não pode ser publicado como está**, qualquer visitante veria e alteraria os dados. Isso é decisão de produto (já registrada em `DECISIONS.md` na seção Resumo), não de limpeza.
- **Isolamento por usuário:** todas as leituras filtram por `userId`; os `update/delete` por `id` (em `bills.ts` e `goals.ts`) são precedidos de `getBill`/`getGoal`, que filtram por `userId`.
- **Validação de entrada:** todas as server actions validam com `lib/validate.ts`/`sanitizeDraft`; `confirmIncome` recalcula a distribuição no servidor ("o cliente nunca dita os números").
- **`"use client"`:** 23 arquivos, todos com estado, efeito ou hook de navegação; não achei nenhum desnecessário. Nenhum dado sensível vai ao cliente.
- **Prisma fora de `lib/services`:** nenhum arquivo em `app/` ou `components/` importa o banco.
- **N+1:** não há consulta dentro de laço de leitura. Os laços com `update` (`confirmIncome`, `deleteGoal`) rodam dentro de transação, com poucas linhas.

## 7. O que você esperava ver e já está resolvido

- Moeda em **centavos inteiros** em todo o app (as divisões por 100 só existem nos eixos dos gráficos).
- `formatEUR` única para centavos; datas centralizadas em `lib/engine/dates.ts`.
- **Tipos da API e da UI num lugar só:** `lib/dashboard/types.ts`.
- **Acesso ao banco só em `lib/services`.**
- Componentes de UI reutilizáveis já extraídos (`Button`, `Chip`, `Keypad`, `MoneyField`, `ProgressBar`).
- Sem `any`, sem `@ts-ignore`; apenas 3 asserções `as` (`db.ts`, `draft.ts`, `ResumoView`), todas justificadas.
- Nenhum arquivo acima de 300 linhas de código (o maior é `ReceberFlow.tsx`, 293).

## 8. Pontos sem cobertura de teste que as refatorações tocariam

| Área | Hoje | Refatoração |
|---|---|---|
| `lib/validate.ts`, `lib/draft.ts` (`sanitizeDraft`) | sem teste | R-2 |
| `weekStats` (`lib/services/state.ts`) | sem teste | R-4 |
| `getOrCreateUser` / contagem de consultas | sem teste | R-3 |
| Pré-visualização em `ReceberFlow`/`GastarFlow` | só e2e | R-5 |
| Tratamento de erro dos formulários | só e2e | R-1 |
| Serviços `bills`, `goals`, `income`, `expense` | só e2e | (nenhuma, listado por completude) |

## 9. Observação sobre o `next build`

Em 2 de 3 execuções o `next build` terminou com `exit 1` e uma mensagem de `SecurityFatalError` dizendo que o Next 16.4.0 tem uma vulnerabilidade conhecida; repetir o mesmo comando conclui normalmente. Não rodei nenhum upgrade (a regra "não atualizar versões" vale para esta tarefa). Convém decidir isso numa tarefa separada.

---

# Execução (etapas 2 e 3)

Branch `chore/limpeza-refatoracao`. Cada commit rodou `tsc`, ESLint, Vitest e `next build`; os que mexem em telas rodaram também o e2e completo (9/9 no final).

## O que foi feito

| Commit | Item | Resultado |
|---|---|---|
| `test:` caracterização | validate, `sanitizeDraft`, `weekStats` | +16 testes, escritos **antes** das refatorações e passando contra o código antigo |
| `refactor:` constante e `.env.example` | R-8 | `MIN_RECEBIMENTOS` único (UI + serviço); `MetaStatus` deixou de ser exportado; `.env.example` criado e liberado no `.gitignore` |
| `refactor:` `MAX_CENTS` e `isDeadline` | R-2 | teto de valor e regex de prazo únicos em `lib/validate.ts` (a cópia de `goals.ts` **não foi tocada**, ver §4) |
| `refactor:` `weekPool`/`weekSpent` | R-4 | fórmula do livre da semana só em `lib/engine/week.ts`, usada por `weekStats` e pelo ritmo do Resumo (+3 testes) |
| `refactor:` `useAction` e `FormError` | R-1 | 8 cópias do `try/catch NEXT_REDIRECT` e 6 parágrafos de erro viraram 1 hook e 1 componente. Única diferença de comportamento: a tela final do onboarding agora limpa o erro anterior ao tentar de novo (as demais já faziam isso) |
| `refactor:` `previewAllocations` | R-5 | aritmética de prévia do "Ajustar" saiu de `ReceberFlow` para o motor (+4 testes); `GastarFlow` usa `freeAfterExpense` |
| `refactor:` `ProgressBar` | R-6 | `ProgressBar` ganhou `size`, `fillClassName` e `marker`; as 3 barras inline do Resumo usam o componente. Screenshots em 390px antes/depois: idênticos |

## O que ficou de fora (e por quê)

- **R-3 (`cache()` em `getOrCreateUser`): adiado.** Após uma Server Action o Next re-renderiza a página na mesma requisição; um cache por requisição poderia devolver o usuário antigo (nome/gasto semanal recém-salvos). Não consigo provar o contrário com os testes atuais, e o ganho é pequeno. Precisa de um teste de integração de Server Action antes.
- **R-7 (formatação nos eixos dos gráficos): não feito.** Não estava na lista que recomendei; ganho mínimo.
- **Bug da regex de prazo (§4): não corrigido**, aguardando sua decisão.
- **Cobertura de testes: não medida** (sem `@vitest/coverage-v8`), aguardando sua decisão.
- **Remoções:** não havia nada seguro para remover (§2). Os 4 exports "não usados" que sobram no `knip` são API do motor e fixtures de teste (§3).

## Antes e depois

| Métrica | Antes (`09a7a5f`) | Depois | Obs. |
|---|---|---|---|
| Linhas de código (rastreadas) | 7.622 | 7.790 | +168, mas **só por testes**: código de produção caiu |
| `app` | 3.182 | 3.048 | −134 |
| `components` | 603 | 658 | +55 (hook e componente novos) |
| `lib` | 2.302 | 2.347 | +45 (`week.ts`, `previewAllocations`, constantes) |
| `tests` | 744 | 946 | +202 |
| Arquivos rastreados | 146 | 154 | +8 (4 de teste, 3 de código, `.env.example`) |
| Testes Vitest | 55 | 78 | +23 |
| Testes e2e | 9 | 9 | todos passando |
| Dependências (prod / dev) | 9 / 11 | 9 / 11 | sem mudança |
| Erros / avisos de lint | 0 / 0 | 0 / 0 | |
| Exports sem uso (knip) | 8 + 1 tipo | 4 (+ `sw.js`, falso positivo) | |
| Cópias do padrão `NEXT_REDIRECT` | 8 | 1 | |
| Cópias da fórmula do livre da semana | 2 | 1 | |
| Cobertura de testes | não medida | não medida | |
| JS estático total | 1.142.331 B (345.257 B gzip) | 1.148.984 B (346.500 B gzip) | +0,6% |

**Bundles por rota** (JS específico da rota, bruto / gzip): quase tudo igual. Mudanças: `/gastar` **27 → 31 KB** (9 → 11 KB gzip), porque agora importa `freeAfterExpense` do motor e o motor passa a entrar nesse bundle; `/onboarding` 80 → 81 KB; `/metas/nova`, `/metas/[id]/editar` e `/contas/nova`/`editar` +1 KB gzip ou menos. Se o peso de `/gastar` incomodar, dá para voltar à subtração inline naquele componente (perde a fonte única da fórmula).

## O que testar no celular antes de juntar a branch

1. **Recebi:** informe €2000 → Ver distribuição → toque em **Ajustar**, edite um valor e confira o livre e o "dia a dia + folga"; passe do total e veja o aviso vermelho e o botão bloqueado → Confirmar.
2. **Recebi pouco** (ex.: €280): tela "Faltaram €X" com as duas opções.
3. **Gastei:** digite um valor maior que o livre e confira "Passa €X do livre desta semana".
4. **Erros de formulário:** coloque o celular em modo avião e tente salvar uma conta, uma meta e os ajustes: deve aparecer a mensagem de erro (centralizada em Ajustes/Gastei/Recebi, à esquerda em Conta/Meta).
5. **Resumo:** as 3 abas (Semana/Mês/3 meses), barras de metas com o traço de "ritmo esperado", categorias e cobertura.
6. **Onboarding** completo até "Começar a usar".
7. Confira que o arquivo `docs/GUIA-DE-ESTUDO.md` aparece apagado no seu working tree, **não foi feito por esta tarefa**.
