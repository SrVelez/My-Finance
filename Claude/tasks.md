

Você vai construir o MVP do **Finança**, um assistente financeiro pessoal mobile-first. A ideia central: **"Você recebe. O Finança diz quanto separar."** O usuário informa quanto recebeu e o app distribui automaticamente o dinheiro entre contas fixas, gasto do dia a dia e metas, explicando o porquê de cada valor.

As telas de referência estão em `docs/design/`. **Quando este texto e as imagens divergirem, as imagens mandam.** Todo o texto da interface é em português do Brasil.

## Como trabalhar

1. Leia este documento e todas as imagens em `docs/design/`. Antes de escrever código, apresente um plano curto (stack, modelo de dados, estrutura de pastas, ordem das fases) e espere minha aprovação.
2. Construa em fases (ver final). Ao terminar cada fase, rode testes e lint, e me mostre o que funciona.
3. O **motor de distribuição** é o coração do produto: implemente como funções puras, sem dependência de UI ou banco, com testes unitários que reproduzem exatamente os números das telas (seção "Casos de teste obrigatórios").
4. Se encontrar ambiguidade, escolha a opção mais simples, registre a decisão em `docs/DECISIONS.md` e siga.

## Stack sugerida

- Next.js (App Router) + TypeScript estrito + Tailwind CSS
- Prisma + SQLite no MVP (fácil trocar por Postgres depois)
- Vitest para testes do motor; Playwright para 1–2 fluxos ponta a ponta
- PWA instalável, layout mobile (largura ~390px), centralizado em telas maiores
- Sem autenticação no MVP: um único usuário local, mas o modelo de dados já tem `userId`

## Regras de dinheiro

- Valores sempre em **centavos inteiros** (nunca float).
- Moeda única no MVP: EUR.
- Formatação no padrão das telas: `€500`, `€23,50`, `€1.500` (símbolo colado, vírgula decimal, ponto de milhar; sem casas decimais quando o valor é inteiro).
- Valores sugeridos pelo motor são arredondados para euros inteiros; a sobra do arredondamento vai para a folga.
- Dias da semana e datas calculados a partir das datas reais (os rótulos de dia da semana nos mockups são ilustrativos).

## Conceitos (manter separados)

**Conta fixa ≠ Gasto semanal ≠ Meta ≠ Transação.**

- **Conta fixa** (`Bill`): nome, valor, dia de vencimento mensal, saldo guardado no ciclo atual, status do ciclo. Ex.: Aluguel €640 dia 1, Curso €125 dia 10, Telefone €20 dia 20.
- **Gasto semanal** (`weeklyLiving`): quanto o usuário precisa por semana para viver (mercado, transporte, dia a dia). Ex.: €120/semana.
- **Meta** (`Goal`): nome, valor-alvo, saldo guardado, prazo opcional (mês/ano), valor semanal (calculado se tem prazo; definido pelo usuário se não tem), posição na ordem de prioridade.
- **Transação** (`Transaction`): `income` (Recebi), `expense` (Gastei, com categoria: Mercado, Transporte, Comer fora, Outro), `allocation` (dinheiro guardado em conta/meta), `withdrawal` (dinheiro tirado de uma meta, ex. reserva de emergência), `bill_payment`.
- **Semana**: o ciclo do app é semanal (ex.: "Semana de 6 a 12 out"). O "livre para gastar" pertence à semana.
- **Simulação** (`Simulation`): resultado do motor que **não altera nenhum saldo**. Só vira transação real quando o usuário toca em "Confirmar" / "Começar a usar".

(O conceito de "Fundos" agrupando contas por país, ex. Fundo Irlanda / Fundo Brasil, fica para a V2. Não implemente agora, mas não feche a porta no modelo de dados.)

## Motor de distribuição

Entrada: valor recebido, data, estado atual (contas, metas, saldos, ordem de prioridade, gasto semanal). Saída: lista de alocações, cada uma com valor e **motivo em texto curto**, mais o valor livre da semana.

Ordem fixa de prioridade:

1. **Contas fixas** (sempre primeiro, travado). Para cada conta: `falta = valor - guardado no ciclo`; `pagamentos restantes = nº de recebimentos semanais até o vencimento`; `alocação = falta / pagamentos restantes`, arredondado. Se a conta já está toda guardada, aloca €0 ("Coberto" / "Valor todo guardado").
2. **Gasto da semana** (sempre segundo, travado): reserva o valor semanal do dia a dia.
3. **Metas**, na ordem definida pelo usuário (arrastar para ordenar):
   - Com prazo: `(alvo - guardado) / semanas até o prazo`.
   - Sem prazo: o valor semanal que o usuário definiu. Sugestão padrão ao criar: um valor redondo que completa a meta em ~16 semanas (ex.: €400 → €25/semana), editável.
   - Metas completas recebem €0.
4. **Folga**: o que sobra. `Livre para gastar = gasto da semana + folga`.

Quando o dinheiro não dá para tudo:

- Contas fixas são sempre cobertas primeiro.
- Depois o dia a dia; se ficar abaixo do valor semanal, mostrar quanto faltou.
- Metas recebem na ordem; as últimas da lista recebem menos ou nada ("Pausadas nesta semana").
- O app oferece duas escolhas: **usar a reserva de emergência para completar o dia a dia** (mostrando o saldo antes → depois) ou **seguir com menos esta semana** (nada sai das metas).
- O usuário sempre vê o motivo de cada valor.

Ciclo das contas:

- Se a data atual passou do vencimento, a conta é **considerada paga**: o saldo do ciclo é consumido, o próximo ciclo começa com €0 guardado, e ela aparece em "Já venceram" com o botão **"Não foi pago"** (que reverte o status e volta a cobrar o valor).

Gastos:

- "Gastei" registra a despesa com categoria e reduz o livre da semana ("Sobram €144,50 livres esta semana").

## Casos de teste obrigatórios (vêm das telas)

Estado base: Aluguel €640 (dia 1), Curso €125 (dia 10), Telefone €20 (dia 20), gasto semanal €120; metas na ordem: 1) Renovação do visto €300 até fev/2027, 2) Reserva de emergência €400 sem prazo, €25/semana, 3) Viagem €600 até jun/2027.

1. **Prévia do onboarding, recebendo €500 (tudo zerado):** Aluguel €160, Curso €31, Telefone €5 (contas = €196); Visto €16, Reserva €25, Viagem €17 (metas = €58); livre = **€246** (€120 dia a dia + €126 folga). Nada é gravado.
2. **Recebi €500 em 8/out** (Aluguel com €320 guardados, 2 pagamentos até 1/nov; Curso pago em 10/out, novo ciclo €125 em 4 pagamentos até 10/nov; Telefone com €15 guardados; Visto €96 de €300; Reserva €150; Viagem €85): Aluguel €160, Curso €31, Telefone €5, Visto €11, Reserva €25, Viagem €14 → para guardar **€246**, livre **€254** (€120 + €134 de folga). Motivos exibidos: "Faltam €320 até 1/nov, em 2 pagamentos", "€125 até 10/nov, em 4 pagamentos", "Complete os €20 de 20/out", "Faltam €204 até fev/2027", "Valor semanal que você definiu", "Faltam €515 até jun/2027".
3. **Recebi €280:** contas €196 (totalmente cobertas), dia a dia €84 (€36 abaixo dos €120), metas €0 (pausadas). Faltaram **€36**. Opção A: usar €36 da reserva (€150 → €114), livre €120. Opção B: livre €84, metas intactas.
4. **Gastei €23,50 (Mercado)** com €168 livres → sobram €144,50.
5. **Simulação não altera saldos**: rodar o caso 1 e verificar que nenhum saldo mudou.
6. **Vencimento passado**: Aluguel de 1/out com data atual 8/out → considerado pago, aparece em "Já venceram"; "Não foi pago" reverte.

Se algum número não fechar com as fórmulas acima, ajuste as fórmulas (arredondamento, contagem de semanas) até os seis casos passarem, e documente em `docs/DECISIONS.md`.

## Telas

### Onboarding (4 passos, barra de progresso "1 de 4", botão voltar)

1. **Contas fixas** — "Quais são suas contas fixas?" / "Tudo o que você paga todo mês. Dá para ajustar depois." Chips de sugestão (Aluguel, Curso, Telefone, Academia, Internet, Transporte, Streaming, + Outra); selecionar um chip adiciona a conta na lista com valor e "Vence todo dia X" editáveis. Card "Quanto você precisa por semana para viver?" com campo "€ ___ por semana". Botão "Continuar".
2. **Metas** — "Para o que você quer juntar dinheiro?" / "Metas com prazo recebem um valor certo por semana até a data." Chips (Reserva de emergência, Renovação do visto, Viagem, Mandar para o Brasil, Quitar dívida, + Outra). Cada meta vira um card editável inline ("Editando") com "Quanto juntar" e "Prazo (opcional)"; sem prazo, mostra "Sem prazo, sugerimos €25 por semana. Você pode mudar." Botões "Continuar" e "Pular por agora".
3. **Prioridades** — "O que é mais importante para você?" / "Arraste para ordenar. O que está no topo recebe dinheiro primeiro." Seção "SEMPRE PRIMEIRO" com cadeado: Contas fixas (€785/mês) e Gasto da semana (€120/sem). Seção "SUAS METAS" numerada e arrastável (drag and drop com toque). Aviso laranja: "Se o dinheiro da semana não der para tudo, as últimas da lista recebem menos. Você sempre vê o motivo."
4. **Prévia** — "Veja como ficaria" / "Uma simulação. Nada foi registrado ainda." Campo "Se eu receber €500" editável. Card verde "Livre para gastar esta semana" com o valor grande e o detalhe "€X para o dia a dia + €Y de folga". Barra empilhada (cinza = contas, laranja = metas, verde = livre). Lista detalhada de Contas fixas e Metas. Botões "Começar a usar" e "Ajustar prioridades".

### App (navegação inferior: Início, Contas, Metas, Ajustes)

- **Início** — "Semana de 6 a 12 out", "Olá, {nome}", sino. Card verde: "Livre para gastar esta semana" + valor, "de €246 · você já gastou €78", barra de progresso, botões "+ Recebi" e "− Gastei". "Próximos vencimentos" (data, nome, valor, status "Coberto" ou "€X guardados") com "Ver todas". "Metas" com barra de progresso e "€96 / €300".
- **Recebi · valor** — fechar (X), "Quanto você recebeu?", valor grande, chip de data ("Hoje, 8 out", editável), teclado numérico próprio (vírgula e apagar), botão "Ver distribuição".
- **Recebi · distribuição** — "Você recebeu €500". Card verde com o livre. Lista "PARA GUARDAR · €246" com valor e motivo por item. Botões "Ajustar" (editar valores manualmente, recalculando o livre) e "Confirmar" (grava transações).
- **Recebi · não deu para tudo** — alerta laranja "Esta semana não deu para tudo / Faltaram €36" com explicação; resumo Contas fixas / Dia a dia / Metas; "O que você prefere?" com as duas opções em radio; "Confirmar".
- **Gastei** — "Quanto você gastou?", valor grande, "Sobram €X livres esta semana" atualizando ao digitar, chips de categoria, teclado numérico, "Registrar gasto".
- **Contas** — "€785 por mês · 3 contas fixas", botão "+". Seção "PRÓXIMAS": cada conta com vencimento, barra de progresso e "€15 guardados · faltam €5" ou "✓ Valor todo guardado". Seção "JÁ VENCERAM" com "considerado pago" e botão "Não foi pago". Tocar numa conta abre edição (nome, valor, dia, excluir).
- **Metas** — "€331 guardados · €50 por semana", botão "Reordenar". Cada meta: número da prioridade, %, "€96 de €300", "€11/semana", status ("✓ No ritmo para fev/2027" ou "Sem prazo · completa em cerca de 10 semanas"). "+ Nova meta". Tocar abre edição.
- **Ajustes** — nome, gasto semanal, dia de início da semana, apagar todos os dados.

## Visual

Siga as imagens. Pontos-chave:

- Fundo cinza-esverdeado bem claro; cards brancos com cantos arredondados (~16px) e borda sutil.
- Verde escuro como cor principal (botões, card de destaque, chips selecionados com fundo verde-claro e borda verde). Laranja para avisos e para a cor de "metas" na barra empilhada; cinza para "contas fixas".
- Tipografia sans-serif geométrica: títulos grandes e muito pesados, valores monetários em destaque; texto secundário cinza e pequeno.
- Botão principal verde, largura total, fixo no rodapé das telas de fluxo.
- Defina as cores como tokens no Tailwind config; nada de cores soltas nos componentes.
- Acessibilidade: contraste AA, alvos de toque ≥ 44px, teclado numérico também aceita digitação física.

## Fora do escopo do MVP (V2)

Chat em linguagem natural ("Recebi €500", "Paguei a internet", "Simula €400" → operações estruturadas, sempre separando simulação de transação real), Fundos por país, Open Banking (Revolut, Wise), importação bancária, notificações, múltiplas moedas, relatórios e análise de gastos. Estruture o código (motor puro + camada de serviços) para que o chat possa chamar as mesmas operações depois.

## Fases

1. **Fundação**: projeto, tokens de design, modelo de dados, seed com o estado base dos casos de teste.
2. **Motor**: funções puras + os 6 casos de teste passando.
3. **Onboarding**: 4 passos, prévia usando o motor em modo simulação.
4. **Fluxos principais**: Início, Recebi (valor → distribuição → não deu para tudo), Gastei.
5. **Contas e Metas**: listas, edição, reordenar, "Não foi pago".
6. **Polimento**: Ajustes, PWA, estados vazios, teste ponta a ponta do fluxo onboarding → recebi → gastei, README com como rodar.