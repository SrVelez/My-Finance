# Decisões

Registro de decisões em pontos ambíguos de `Claude/tasks.md` (opção mais simples escolhida).

## Fase 1 — Fundação
- **Prisma 6** (não 7): SQLite com `DATABASE_URL` em `.env` (ignorado pelo git; ver README). `prisma generate` roda no `postinstall`.
- **`@types/node` ^22**: vitest 5 exige peer `>=22`; o Node local é 22.
- **Tokens de design** via `@theme` do Tailwind 4 em `app/globals.css` (não há `tailwind.config`).
- **Ciclo da conta**: `Bill.paidThrough` guarda o último vencimento (yyyy-mm-dd) já considerado pago; é isso que o motor compara com a data atual.
- **Meta de emergência**: `Goal.isEmergency` identifica a reserva usada na opção "usar a reserva".
- **Seed** = estado da tela Início (8/out): Aluguel €320 guardados, Curso €125, Telefone €15; metas 96/150/85.

## Fase 2 — Motor (`lib/engine`)
As fórmulas literais do brief ("recebimentos semanais até o vencimento") não reproduzem os casos 1 e 2 ao mesmo tempo (ex.: Aluguel €80 em vez de €160). Ajustes que fecham os 6 casos:
- **Contas**: um mês = 4 parcelas semanais. `pagamentos = ⌈falta·4 / valor⌉`, limitado pelos recebimentos semanais até o vencimento (`⌊dias/7⌋+1`, mínimo 1). `alocação = arredondar(falta / pagamentos)` para euros inteiros. Na **prévia do onboarding** (`assumeFreshCycle`) o limite por calendário é ignorado, tratando todas as contas como ciclo novo (senão o Telefone, que vence em 12 dias, daria €10 em vez de €5).
- **Metas com prazo**: o prazo vale **dia 15** do mês e `semanas = ⌈dias/7⌉` (fev/2027 → 19; jun/2027 → 36). Dá Visto €16 (zerado) / €11 e Viagem €17 / €14. Alocação limitada ao que falta.
- **Metas sem prazo**: `min(falta, valor semanal)`. Sugestão padrão: `alvo/16` arredondado a €5 (€400 → €25).
- **Curso no caso 2**: o brief trata o Curso como "pago em 10/out, novo ciclo" mesmo recebendo em 8/out; modelado com `paidThrough = 2026-10-10` e saldo €0 (fixture em `tests/engine/fixtures.ts`). O seed segue as telas Início/Contas (Curso já guardado).
- **Conta nova** (`paidThrough = null`): ao liquidar, só marca o último vencimento sem consumir o saldo (ele já é do ciclo atual).
- **"Não foi pago"**: devolve o saldo consumido, marca `unpaidDue` e a conta passa a vencida (cobrada já, 1 pagamento). Não é reliquidada automaticamente.
- **"Já venceram"**: conta com `paidThrough` nos últimos 14 dias.
- **Dinheiro insuficiente**: contas na ordem da lista até acabar; depois dia a dia; metas pausadas ("Pausada nesta semana").
- Datas do motor são strings `yyyy-mm-dd` (sem fuso); o motor nunca lê o relógio.

## Fase 3 — Onboarding
- Os 4 passos são **um único componente cliente** em `/onboarding` (estado de rascunho em memória, sem persistência entre recargas); só "Começar a usar" grava, via Server Action `finishOnboarding` (valida com `sanitizeDraft`, pois Server Actions aceitam POST direto).
- Começa **vazio** (as telas mostram um exemplo preenchido, mas pedir ao usuário que parta de dados falsos seria pior). "Continuar" no passo 1 exige gasto semanal > 0 e contas válidas.
- "Pular por agora" (ou nenhuma meta) pula a tela de Prioridades e vai direto à prévia.
- Valor semanal de meta sem prazo: sugestão `alvo/16` arredondada a €5, editável (`weeklyCents: null` = usar a sugestão).
- Refazer o onboarding **substitui** contas, metas e transações do usuário.
- Acessos ao banco chamam `connection()` (Cache Components) para nunca entrarem no shell estático.
- **e2e** roda uma build de produção em `.next-e2e` (`NEXT_DIST_DIR`) com banco `prisma/e2e.db` na porta 3100, para não colidir com um `next dev` aberto (o Next só permite um por diretório).

## Fase 4 — Fluxos principais
- **Livre da semana** é derivado só das transações da semana (`weekStats`): `recebido − guardado (allocation) + retirado de metas (withdrawal)`; "restante" = isso − despesas. Não há saldo "livre" armazenado.
- **Semana** = 7 dias a partir de `User.weekStartDay` (padrão segunda); um recebimento conta para a semana da sua data.
- **Confirmar recebimento** recalcula a distribuição no servidor (o cliente só envia valor, data, ajustes e a opção de reserva). Ajustes manuais só valem sem falta de dinheiro; a soma não pode passar do recebido.
- **Contas vencidas** são liquidadas (saldo consumido) de forma persistente apenas ao confirmar um recebimento; nas telas de leitura a liquidação é calculada em memória.
- **Opção A (reserva)**: grava `withdrawal` na meta de emergência (`isEmergency`) e reduz o saldo dela; só aparece se a reserva tem saldo.
- Sino de notificações do Início **omitido** (notificações são V2; evitar botão sem função).
- Data de hoje: no servidor via `serverToday()` (após `connection()`); em Client Components só dentro de `<Suspense>` ou em handlers, senão o Cache Components bloqueia o prerender (`/receber`).
- Contas, Metas e Ajustes são **stubs** até as Fases 5 e 6; a navegação inferior já existe.
- **e2e**: com Cache Components, rotas anteriores ficam ocultas no DOM (`<Activity>`); os testes usam `:visible` (helper `tid`). O build do e2e usa `tsconfig.e2e.json` (via `NEXT_TSCONFIG`) para não depender de `.next/types` de um `next dev` aberto.

## Fase 5 — Contas e Metas
- **`Bill.createdAt` / `EngineBill.createdOn`**: só vencimentos *posteriores* à criação da conta contam. Sem isso, toda conta recém-criada (ex.: Aluguel dia 1 criado no dia 14) aparecia em "Já venceram" como "considerado pago". Vencimento anterior à criação apenas inicializa o ciclo (sem consumir saldo). Isso substitui a regra da Fase 2 "conta nova (paidThrough null) não consome".
- **"Já venceram"** = `paidThrough` posterior à criação, passado e dentro de 14 dias. A mesma conta aparece também em "Próximas" (próximo vencimento), como nas telas.
- **"Não foi pago"** persiste a liquidação, devolve o saldo consumido e move a conta para uma seção **"A PAGAR"**, com o botão **"Paguei"** (extra, não está nas telas) que quita e a devolve a "Já venceram". Sem isso a conta ficaria vencida para sempre.
- **Metas — status**: com prazo → "✓ No ritmo para mês/ano" (o motor recalcula o valor semanal para cumprir o prazo, então está sempre no ritmo) ou "Prazo de … já passou"; sem prazo → "completa em cerca de N semanas" (`⌈falta / semanal⌉`); completa → "✓ Meta completa".
- **Reordenar**: modo próprio (botão "Reordenar" → arrastar → "Concluir"); a ordem só é gravada ao concluir. Excluir meta renumera as prioridades.
- **Reserva de emergência**: uma checkbox no formulário da meta; marcar uma desmarca as outras.
- **Excluir** conta/meta exige confirmação em dois toques. Transações antigas mantêm o histórico (`onDelete: SetNull`).
- **Cache Components**: `usePathname()` da navegação em rotas dinâmicas (`/contas/[id]`) exige `<Suspense>` no layout.
- Seed atualizado: Aluguel criado em 1/set com `paidThrough` 1/out, para reproduzir "Já venceram" das telas (dependente da data: some após 14 dias).

## Fase 6 — Polimento
- **Ajustes**: nome, gasto semanal e dia de início da semana (select). "Apagar todos os dados" exige confirmação, zera usuário/contas/metas/transações e volta ao onboarding. Alterar o gasto semanal vale a partir do próximo recebimento (o livre já registrado não é recalculado).
- **PWA**: `app/manifest.ts` (standalone, tema verde), ícones PNG 192/512/maskable/Apple em `public/icons/` (marca "F" em moeda, gerada a partir de SVG) e `app/icon.svg`. O ícone padrão do Next (`favicon.ico` e SVGs do scaffold) foi removido.
- **Service worker** (`public/sw.js`): só guarda `/offline.html` e o serve quando uma navegação falha. Páginas e dados financeiros **não** são cacheados (ficariam desatualizados e mostrariam saldos errados). Registrado apenas em produção. `/sw.js` é servido com `Cache-Control: no-cache`.
- **Estados vazios**: Início, Contas e Metas têm mensagem própria sem dados; sem onboarding o app redireciona para ele.
- **Pendente conhecido**: o Prisma 6 avisa que `package.json#prisma` (config do seed) será removido no Prisma 7; migrar para `prisma.config.ts` ao atualizar.

## Extrato (Início)
- **Seção "Extrato"** no Início, acima de "Próximos vencimentos", com as 5 entradas mais recentes e "Ver tudo" → `/extrato` (até 200). Cada **recebimento** mostra para onde foi o dinheiro: uma linha por conta/meta (`→ Aluguel €160`), a retirada da reserva (se houve) e **"Livre para gastar"** = recebido − guardado + retirado. **Gastos** aparecem com categoria e sinal −.
- **`Transaction.groupId`** liga o recebimento às alocações/retiradas geradas por ele; `note` guarda o nome do destino (e `category` = `conta`/`meta`) para o extrato continuar legível se a conta ou meta for excluída. Montagem pura e testada em `lib/statement.ts`.
- **Recebimentos anteriores a esta mudança** não têm `groupId`: aparecem sem a divisão (só o valor), e alocações soltas viram "movimentações".
- O recebimento mais recente já vem **aberto** (`<details>`, sem JS); os demais abrem com um toque.
- Pagamento automático de conta vencida **não** gera linha no extrato (não é movimentação do usuário; continua em Contas → "Já venceram").
- Testes e2e deixaram de depender da data do sistema (valores de contas/metas variam conforme o vencimento está próximo).

## Extrato por conta/meta
- **Tocar numa conta ou meta abre o extrato dela** (`/contas/[id]`, `/metas/[id]`), com resumo no topo (valor, progresso, status) e o histórico **separado por data** (mais recente primeiro, "Hoje, 24 out"). A edição que existia ali passou para `/contas/[id]/editar` e `/metas/[id]/editar`, acessível pelo botão **⋮** do cabeçalho; salvar volta ao extrato do item, excluir volta à lista.
- **Conta**: mostra o que foi guardado a cada recebimento ("Do recebimento de €1.200") e o **último vencimento** (pago com o saldo guardado, ou "sem pagamento"). O último vencimento é **derivado** do estado da conta (`paidThrough`/`consumedCents`/`unpaidDue`); o app não guarda pagamentos antigos, então ciclos anteriores ao último não aparecem.
- **Meta**: mostra o guardado a cada recebimento (+) e as retiradas da reserva (−).
- Mesma base do extrato geral: `lib/statement.ts` (funções puras `billHistory`, `goalHistory`, `groupByDate`, testadas) e `lib/services/history.ts`.
- Edições de conta/meta feitas antes de `groupId` existir mostram "De um recebimento" (sem o valor de origem).

## Ciclo da conta: "Você pagou?", atraso e movimentação manual
Substitui a regra automática de "considerado pago" das Fases 2/5 (o app deixou de adivinhar).
- **Vencimento passou → "A confirmar".** O guardado fica **retido** (`consumedCents`) e o novo ciclo já começa em €0 sem esperar resposta. O cartão **"Você pagou?"** aparece em Contas ("A CONFIRMAR") e no Início ("Atenção"), com 3 respostas: **Paguei tudo**, **Paguei outro valor** e **Ainda não paguei** (`payBill` no motor).
- **O que não estava guardado sai do livre.** Pagar R$/€ além do retido vira uma despesa (categoria `Conta`) na semana da confirmação e aparece no extrato ("Pagamento de conta · parte que não estava guardada"). Sobra do guardado volta para o próximo ciclo.
- **Atraso** (`unpaidDue` + `unpaidCents`): não pagou ou pagou parte. O motor separa **o que falta, exato**, no próximo recebimento; recebimentos novos entram em `consumedCents`. Um atraso em aberto **bloqueia** fechar outro ciclo até ser resolvido. Seção "EM ATRASO" em Contas, com "Paguei" e "Paguei outro valor".
- **Pagamentos viram registro real** (`bill_payment`, na data do vencimento): o extrato da conta passa a listar **todos** os vencimentos confirmados (antes só o último, derivado). `confirmedThrough` marca o último confirmado. Só o vencimento mais recente fica pendente: se outro vencimento passar sem resposta, o anterior é fechado em silêncio.
- **Guardar / Retirar à mão** em contas e metas: sempre do/para o **livre da semana** (transação `allocation`/`withdrawal` com `category = "manual"`). Nunca se edita o saldo direto, para o extrato e o livre sempre fecharem. Regras: não passa do que falta, não passa do livre, não retira mais que o guardado. Falhas voltam como mensagem (`ActionResult`), pois o Next esconde mensagens de erros lançados em produção.
- **Meta com prazo vencido** (`deadlinePassed`: depois do último dia do mês-prazo) fica **pausada** no motor (antes tentava separar tudo de uma vez) e mostra o painel com 4 opções: estender o prazo, ajustar o valor-alvo (segue sem prazo), continuar sem prazo, ou concluir com o que juntou.
- **Avisos de proximidade**: "Vence hoje/amanhã/em N dias" (até 7 dias) em destaque quando ainda falta guardar, com quantos recebimentos ainda cabem; metas com prazo mostram "faltam N semanas" (≤ 8).
- Contas antigas no banco: `paidThrough` preenchido e `confirmedThrough` nulo aparecem como "a confirmar"; atrasos antigos sem `unpaidCents` usam o valor cheio da conta.

## Resumo (dashboard)
- **Aba "Resumo"** (`/resumo`) na barra inferior: Início, Contas, Metas, Resumo, Ajustes. Seletor **Semana / Mês / 3 meses** (padrão Semana), lembrado em `localStorage` (leitura e escrita em try/catch; sem `localStorage`, vale só até fechar a aba).
- **Nenhum cálculo financeiro no cliente.** `GET /api/dashboard?periodo=` devolve o JSON já agregado, com as frases de conclusão (`lib/dashboard/types.ts`). As agregações são funções puras em `lib/dashboard/` (testes em `tests/dashboard/`); `lib/services/dashboard.ts` só lê o Prisma, sempre filtrando por `userId`. O cliente só converte centavos em euros para o eixo dos gráficos.
- **Sem Better Auth.** O projeto não tem login (usuário único local, `getOrCreateUser`). A rota usa o mesmo usuário e `getDashboardFor(user, …)` recebe o usuário explicitamente; o isolamento é coberto por um teste de integração com SQLite próprio (`prisma/vitest.db`, recriado a cada execução). Autenticação fica para quando o app for publicado.
- **Schema:** `Goal.createdAt` (base do traço de "ritmo esperado"; metas antigas ficam com a data da migração, então o esperado delas começa em 0%) e `Transaction.shortfallCents` (só em `income`, gravado em `confirmIncome`; `null` nos recebimentos antigos).
- **Divisão de cada recebimento** (contas / dia a dia / metas / folga): contas e metas vêm das alocações do `groupId`; o dia a dia é `min(gasto semanal atual, sobra)`. O app **não guarda o gasto semanal histórico**, então se o usuário mudou o valor em Ajustes, recebimentos antigos usam o valor atual. Falta = `shortfallCents`, ou, se `null`, `gasto semanal − dia a dia`. Com a reserva de emergência (Opção A), a retirada entra na sobra.
- **Semana apertada** = semana com pelo menos um recebimento com falta > 0.
- **Ritmo ideal** = `livre × dia/7`, arredondado para euro inteiro (4º dia de €246 → €141). O "por dia" para fechar a semana também é em euros inteiros (para baixo). Livre da semana = recebido − guardado + retirado (a mesma regra do Início).
- **Meta com prazo:** esperado = `semanas desde a criação ÷ semanas até o prazo` (mesma contagem do motor: prazo = dia 15 do mês). Atraso = `esperado em € − guardado`; o acréscimo é `⌈atraso ÷ semanas restantes⌉` em euros inteiros. Ex.: Viagem €85/€600, criada em 20/ago, em 8/out: esperado 16%, real 14%, **€12,67 atrás · +€1/semana**. (O "€8" do prompt era só um exemplo de texto.) Prazo vencido e não concluída = atrasada. Sem prazo: `⌈faltante ÷ valor semanal⌉` semanas.
- **Categorias:** só as do "Gastei"; qualquer outra despesa (ex.: a parte de uma conta paga do livre, categoria `Conta`) soma em "Outro" para o total não perder dinheiro. A comparação é com o período imediatamente anterior, do mesmo tamanho.
- **Cobertura do próximo mês:** soma o que falta guardar para o **próximo vencimento** de cada conta; "N recebimentos" é o menor prazo entre as contas ainda abertas (o vencimento mais urgente limita).
- **Tendências** (barras por recebimento e categorias) só aparecem com 3 recebimentos no total; antes, "Seu histórico aparece depois de 3 recebimentos. Faltam N."
- **Gráficos:** Recharts, carregado com `next/dynamic` (`ssr: false`) dentro de Client Components. Tokens `chart-bills/living/goals/free/late` no Tailwind (≥3:1 sobre o fundo claro), toda série com legenda em texto e o ritmo ideal tracejado. Cada gráfico tem alternativa em texto para leitores de tela (e o toque nas barras também funciona por teclado).
- **Só tema claro:** o app ainda não tem modo escuro; a verificação visual foi feita em 390px no claro.
- **Seed:** `npm run db:seed:resumo` (8 semanas: €500, 450, 500, 280, 500, 520, 480, 500 a partir de 1/set/2026, mais um segundo usuário). Como o `seed.ts`, **apaga os usuários**: use `DATABASE_URL=file:./demo.db`.

## Saldo inicial e ajuste de saldo
- **Saldo nunca é editado direto.** Toda mudança vira uma `Transaction`: `opening_balance` (saldo que já existia fora do app) ou `adjustment` (correção manual). Nenhum dos dois é receita: não entram em "Recebido", "Guardado %" nem em "Para onde foi cada recebimento" (essas agregações só olham `income` e o `groupId` do recebimento). Contam no progresso porque o saldo está em `Bill.savedCents`/`Goal.savedCents`.
- **Campos novos em `Transaction`:** `reason`, `affectsWeeklyFree`, `undoneAt` (pedidos) e `balanceAfterCents` (extra: saldo logo depois do registro; permite mostrar "De €150 para €0" no histórico e saber de onde o marcador do Resumo parte). Sem pasta de migrações no projeto: entram por `prisma db push` (só colunas novas, sem perda de dados).
- **`adjustment.amountCents` tem sinal** (negativo reduz o saldo). Só nos ajustes; nas outras transações o valor continua sempre positivo.
- **Motivos:** `match_bank`, `used`, `return_to_free`, `reset` (pedidos) e `from_free` ("tirar do livre da semana"), que o pedido usava na tela mas não listava. `opening_balance` usa `reason = "paid_before"` para "já paguei este mês".
- **O livre da semana não ganhou fórmula nova.** `weekTxsOf` (lib/engine/balance.ts) traduz ajustes para o que `weekPool` já entende: aumento tirado do livre vale como "guardar", diminuição devolvida ao livre vale como "retirar"; ajuste que não afeta o livre e ajuste desfeito somem. `weekStats` e o ritmo do Resumo usam essa mesma tradução.
- **O "saldo" de uma conta é o que a tela mostra:** o guardado do ciclo atual, ou o dinheiro retido se há vencimento em atraso (igual a `moveBillMoney`). Contas têm teto no valor do vencimento; metas podem passar do alvo (nascem concluídas; o motor já tolera).
- **"Já paguei este mês" não muda os números.** O motor já ignora o vencimento anterior (ou igual) à criação da conta, então o ciclo seguinte já começa em €0. Fica só uma marca informativa (`paidThrough`/`confirmedThrough` e um `opening_balance` de €0 com `reason = paid_before`), que aparece no histórico. Só vale se o vencimento deste mês já passou ou é hoje.
- **Ajuste e desfazer são atômicos:** a leitura do saldo e do livre acontece dentro da mesma transação do banco que grava o ajuste (sem a janela de corrida de `moveBillMoney`).
- **Desfazer:** só o último movimento ativo daquela conta/meta pode ser desfeito (antes dele, o saldo não seria o que o ajuste deixou). Os 10 segundos são só do aviso na tela; o servidor não impõe prazo. O registro fica com `undoneAt` e aparece no histórico como "Ajuste desfeito".
- **Recomeçar saldos** (Ajustes): um `adjustment` `reset` por conta/meta **que tem saldo** (itens já em €0 ficam de fora: seria um ajuste de zero), todos com o mesmo `groupId`. Confirmação digitando ZERAR (conferida também no servidor) e "Desfazer" em lote por 10 segundos, tudo ou nada. Diferente de "Apagar todos os dados".
- **Marcador "esperado" do Resumo:** `base + (alvo − base) × semanas decorridas ÷ semanas totais`, com `base` = saldo inicial ou saldo depois do último ajuste ativo, e o relógio contando da data desse registro. Sem registros, parte de €0 na criação (testes antigos intactos).
- **Onboarding:** `completeOnboardingFor` grava contas, metas e saldos iniciais numa única transação (se algo for inválido, nada é gravado e o que existia continua). A prévia do passo 4 usa os saldos e continua só simulação.
- **Segurança:** não há sessão no projeto (usuário único local). Toda operação filtra por `userId`; id de outro usuário devolve "Conta/Meta não encontrada." (e as páginas usam `notFound()`).
- **Datas:** contas e metas novas guardam `createdAt` ao meio-dia local do dia da criação, para `createdOn` ser exatamente "hoje" e os testes terem data fixa.

## Login e dados separados por usuário (Fase 1: schema e acesso)
- **Só `lib/services` e `lib/auth` falam com o Prisma** (regra de lint `no-restricted-imports`, com exceção para `tests/`, `e2e/`, `prisma/` e `scripts/`). Toda função de serviço recebe o `userId` (ou o usuário) como primeiro parâmetro e filtra por ele em todo `where`, inclusive em `update`/`delete` (`updateMany`/`deleteMany` com `{ id, userId }`). Páginas, ações e rotas chamam `requireUser()` e depois o serviço. Registro de outra pessoa = "não encontrado" (404), nunca 403.
- **`requireUser()` (`lib/auth/session.ts`)** devolve `{ userId }`. Na Fase 1 ele ainda resolve o usuário local único (o app continua funcionando); a Fase 2 troca o corpo pela sessão do Better Auth. O `userId` nunca vem do corpo da requisição: as ações só aceitam os campos do formulário (um `userId` extra é descartado) e os testes provam isso chamando as ações de verdade.
- **O usuário "legado" já existia:** o app sempre teve um `User` e todo registro já tinha `userId` com `onDelete: Cascade`. Por isso a migração não move linha nenhuma: `npm run db:prepare-login` dá ao usuário existente o e-mail provisório `legado@financa.local` (necessário porque `User.email` agora é obrigatório e único) e depois `prisma db push` aplica o schema. `npm run claim-legacy -- --email meu@email.com` transfere os dados dele para a sua conta (que precisa existir e estar vazia; nunca mistura dados) e apaga o legado.
- **`User.email` tem `@default(cuid())`** só para código que cria usuários direto no banco (seeds e testes, que precisam continuar passando sem alteração). As contas reais sempre informam o e-mail via Better Auth.
- **Sem pasta de migrações:** o projeto usa `prisma db push` (só colunas e tabelas novas). Antes da mudança foi feita uma cópia de `dev.db`.
- **Sem `@@unique([userId, name])` em Conta e Meta:** nomes repetidos já eram permitidos, e a unicidade conflitaria com "Substituir pelo novo plano" (que arquiva e recria "Aluguel", por exemplo); no SQLite ela também não ignora os arquivados.
- **Arquivar em vez de apagar:** `Bill.archivedAt` e `Goal.archivedAt` (para "Substituir pelo novo plano"). Toda consulta de conta e meta usa `active` (`archivedAt: null`): motor, listas, Início, Resumo, saldo e telas de detalhe. O histórico (transações) continua.
- **Novas tabelas:** `Session`, `Account`, `Verification`, `Passkey`, `RateLimit` (Better Auth), `OtpSend` (limite de envios de código por e-mail, que o Better Auth não tem) e `OnboardingClaim` (`userId` + `draftId` únicos: o claim do rascunho é idempotente mesmo com duplo toque simultâneo).
- **Índices** compostos começando por `userId` em `Transaction` (`date`, `goalId`, `billId`, `type`).
- **Testes:** `tests/isolation.test.ts` (cada operação de serviço e cada ação, com dois usuários; uma mutação de propósito no filtro foi detectada), `tests/legacy.test.ts` (banco com o schema antigo → migração → claim) e `tests/lint-rule.test.ts` (a regra falha se Prisma for importado fora da camada de serviços).

## Login (Fase 2: Better Auth)
- **Better Auth 1.7.19** (nomes conferidos nos tipos instalados): `emailOTP` (6 dígitos, validade 600 s, 5 tentativas), `@better-auth/passkey` (pacote separado), `nextCookies` (último plugin), adaptador do Prisma para SQLite. Rota em `app/api/auth/[...all]`.
- **Código por e-mail:** mesma tela entra ou cria conta (e-mail novo é cadastrado ao confirmar o código). A resposta de "pedir código" é sempre `{ success: true }`, igual para e-mail existente e inexistente (teste 5). O código é guardado **cifrado** e o reenvio **reaproveita** o mesmo código (`resendStrategy: "reuse"`): quem pedir códigos repetidos para o e-mail de outra pessoa não invalida o dele nem zera as tentativas. Passadas as 5 tentativas, o código deixa de valer.
- **Limites:** por IP e caminho (Better Auth, guardado no banco, 429) e **por e-mail** (tabela `OtpSend`, que o Better Auth não tem): 1 envio a cada 30 s e no máximo 5 a cada 10 min. Quando o limite por e-mail nega, o servidor simplesmente não envia e responde igual (nunca revela nada). `AUTH_RATE_LIMIT=off` existe só para os testes automatizados.
- **Sessão:** cookie `HttpOnly`, `SameSite=Lax`, `Secure` quando `BETTER_AUTH_URL` é https; 60 dias, renovada a cada uso diário; sem cache de sessão no cookie (encerrar um aparelho vale na hora). Nada em `localStorage`.
- **Google** ligado só se `GOOGLE_CLIENT_ID/SECRET` existem; **Apple** pronta, mas desligada por `AUTH_APPLE_ENABLED=false`. Entrar com Google numa conta que já existe por e-mail usa a mesma conta (`accountLinking`).
- **E-mail (`sendOtpEmail`):** desenvolvimento imprime o código no terminal; produção usa o Resend por `fetch` (sem pacote novo; `RESEND_API_KEY` e `EMAIL_FROM`). `EMAIL_TRANSPORT=file|memory` existe **só para testes** (o e2e roda em modo produção e lê o código de um arquivo). Texto: "Seu código do Finança é 123456. Ele vale por 10 minutos."
- **Next 16: `proxy.ts`** (antes `middleware`) só faz o redirecionamento rápido por cookie (`getSessionCookie`, que NÃO valida a sessão): sem cookie, `/` mostra as Boas-vindas (rewrite, a URL continua `/`) e as áreas protegidas voltam para `/`. A validação real é de cada página (`requirePageUser`, redireciona), ação e rota (`requireUser`, lança 401).
- **Sem loop de redirecionamento:** um cookie vencido em `/` redireciona para `/bem-vindo` (que é pública), não para `/`.
- **Origens:** `BETTER_AUTH_URL` + `AUTH_TRUSTED_ORIGINS` (opcional, para abrir o app pelo IP da rede no celular).
- **E2E:** cada teste agora é uma pessoa nova (`signIn` pela API do Better Auth lendo o código do arquivo), então não há mais estado compartilhado entre testes.

## Login (Fase 3: telas e claim do rascunho)
- **Fluxo:** Boas-vindas (`/` sem sessão, via `proxy.ts`; a página é `/bem-vindo`) → onboarding SEM login → prévia → **"Salve seu plano"** (`/entrar?etapa=plano`) → código → nome (só login por e-mail sem nome) → passkey (opcional, só se o aparelho suporta e a conta ainda não tem) → Início. "Já tenho conta" é a mesma tela com o título "Entrar". Quem já está logado só passa por `/entrar` para gravar o rascunho (e não vê as etapas de nome e passkey: elas são para quem acabou de entrar).
- **Rascunho local:** `lib/draftStorage.ts` (`localStorage` com try/catch e memória como reserva) com um `draftId`. Depois de gravado na conta, é apagado. O onboarding deixou de ter Server Action: `finishOnboarding` foi removida.
- **`POST /api/onboarding/claim`:** `userId` só da sessão; o corpo é validado com **Zod** (`lib/validation/claim.ts`: só entradas, campos extras como um `userId` são descartados) e conferido de novo por `sanitizeDraft` e pelas regras dos saldos iniciais; o servidor recalcula tudo. Tudo numa **única transação** e **idempotente** pela chave única `OnboardingClaim(userId, draftId)`: o mesmo `draftId` duas vezes (inclusive dois pedidos simultâneos) devolve `already` e não duplica nada. Respostas: 200 `saved|already|kept`, 409 `has_plan`, 400 inválido, 401 sem sessão.
- **Conta que já tem plano:** sem escolha, o claim devolve 409 e não grava nada; a tela pergunta "Você já tem um plano salvo nesta conta." → **"Usar o plano salvo"** (`keep`, descarta o rascunho) ou **"Substituir pelo novo"** (`replace`, com confirmação extra): zera os saldos antigos com um `adjustment` `reset` por item (mesma função do "Recomeçar saldos"), **arquiva** as contas e metas antigas (`archivedAt`) e grava o novo plano. Nada do histórico é apagado.
- **Erros de código em linguagem simples:** "Código incorreto. Restam N tentativas.", "O código expirou. Enviamos outro?" e, esgotadas as 5 tentativas, "Peça um novo código". Seis caixas com `autocomplete="one-time-code"`, aceitam colar o código inteiro; "Trocar e-mail" e "Reenviar em 30s".
- **E-mail inválido:** o formulário usa `noValidate` para mostrar a mensagem do app ("Digite um e-mail válido.") em vez do balão nativo do navegador.
- **Termos e Privacidade:** `/termos` e `/privacidade` são **rascunhos curtos marcados para revisão jurídica**, não texto legal definitivo.
- **Google/Apple:** os botões só aparecem se as credenciais estiverem no ambiente (Apple também exige `AUTH_APPLE_ENABLED=true`). Sem credenciais, não dá para testar o retorno do OAuth de ponta a ponta; o caminho por código de e-mail é totalmente testado.

## Login (Fase 4: Conta em Ajustes)
- **Ajustes → Conta** (`components/AccountSection.tsx`): nome (editável, com "Salvar nome") e e-mail (só aparece; ele é a identidade da conta); formas de entrar (código por e-mail, Google conectado e passkeys, com "Remover" e "Adicionar passkey"); aparelhos conectados (aparelho/navegador e último uso, "Sair deste aparelho" e "Sair de todos os outros"); exportar; apagar; sair. Aparelhos, passkeys e contas conectadas vêm do Better Auth e são sempre só do usuário logado. O campo de nome saiu do formulário de configurações (que continua guardando o nome atual sem alterá-lo).
- **Exportar** (`GET /api/account/export`): JSON com configurações, contas e metas (inclusive arquivadas), todas as transações (recebimentos, gastos, alocações, saldos iniciais e ajustes) e as formas de entrar. **Nunca** inclui segredos de login (tokens de sessão/OAuth, chave de passkey) nem dados de outra pessoa; `Cache-Control: no-store`.
- **Apagar conta:** exige digitar o e-mail (sem diferenciar maiúsculas). Apaga o usuário e tudo dele por `onDelete: Cascade` (contas, metas, transações, ajustes, sessões, passkeys, contas conectadas, claims) mais os registros de código por e-mail; encerra o cookie deste aparelho e volta às Boas-vindas. Os dados de outras pessoas não são tocados (testado). Entrar de novo com o mesmo e-mail cria uma conta nova e vazia.
- **Limite por e-mail e entradas seguidas:** o intervalo mínimo de 30 s entre códigos para o mesmo e-mail também vale para entrar em dois aparelhos quase ao mesmo tempo (o segundo vê "Reenviar em 30s"). É o preço de impedir que alguém dispare e-mails para a caixa de outra pessoa; o e2e desliga esse intervalo (`AUTH_OTP_MIN_GAP_SECONDS=0`).
- **Bloqueio ao abrir com PIN de 4 dígitos (seção 7): ADIADO.** Era opcional nesta etapa, depende de definir o que bloqueia (só a tela, ou também as ações) e como recuperar um PIN esquecido sem enfraquecer o login. Fica como tarefa própria.
- **Dependências novas:** `better-auth`, `@better-auth/passkey` e `zod` (antes só indireta). O Resend é chamado por `fetch` (sem pacote).

## Publicação na Vercel (Postgres)
- **Problema:** o primeiro deploy quebrou com `the URL must start with the protocol file:`. O `schema.prisma` declarava `provider = "sqlite"` e o `DATABASE_URL` da Vercel era Postgres. Além disso, SQLite em arquivo não funciona na Vercel (disco descartável e somente leitura).
- **Solução: um código, dois bancos.** `prisma/schema.prisma` continua SQLite (computador, testes, e2e). `scripts/prisma-setup.mjs` (usado no `postinstall` e no `vercel-build`) detecta `DATABASE_URL` `postgres://` e gera o cliente e as tabelas a partir de uma **cópia** com `provider = "postgresql"` (`prisma/schema.postgres.prisma`, gerada e ignorada pelo git). Nenhum arquivo versionado muda no deploy. O adaptador do Better Auth (`lib/auth/auth.ts`) escolhe `postgresql` ou `sqlite` pelo mesmo `DATABASE_URL`.
- **Tabelas no deploy:** `vercel-build` roda `prisma db push --skip-generate` (usando `DIRECT_URL` se existir, por causa do pooler do Neon) e só depois `next build`. `db push` só adiciona; se uma mudança futura exigir apagar dados, o deploy falha em vez de apagar.
- **Verificado em Postgres real** (um Postgres temporário local, não o da Vercel): as 11 tabelas são criadas sem erro, o `next build` passa em modo Postgres e **49 testes de integração** rodaram contra ele — isolamento entre usuários, claim do rascunho (inclusive o duplo toque simultâneo), código por e-mail, sessões, exportar/apagar conta, saldo/ajustes e livre da semana. Ainda assim, a suíte versionada roda em SQLite; antes de mudanças grandes no banco vale repetir essa verificação.
- **Endereço na Vercel:** sem `BETTER_AUTH_URL`, usa `VERCEL_PROJECT_PRODUCTION_URL`; o endereço de cada deploy (`VERCEL_URL`) também é aceito como origem (previews).
- **Ferramentas só de SQLite:** `db:prepare-login` e `claim-legacy` (migração dos dados de antes do login) usam SQLite e não se aplicam a um Postgres novo.
