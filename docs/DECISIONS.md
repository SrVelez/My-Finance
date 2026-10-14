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
