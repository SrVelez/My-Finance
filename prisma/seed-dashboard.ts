import { PrismaClient } from "@prisma/client";
import { addDays } from "../lib/engine";
import { euros } from "../lib/money";
import { gasto, SEMANA_1, seedTxs } from "../tests/dashboard/fixtures";

const db = new PrismaClient();
const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * Dados do Resumo: 8 semanas de recebimentos (€500, 450, 500, 280, 500, 520, 480, 500 a partir de
 * 1/set/2026), gastos por categoria e um segundo usuário que nunca pode aparecer no primeiro.
 * Como o `seed.ts`, APAGA os usuários existentes: rode com `DATABASE_URL=file:./demo.db`.
 */
async function main() {
  await db.user.deleteMany();

  const lucas = await db.user.create({
    data: {
      name: "Lucas",
      weeklyLivingCents: euros(120),
      weekStartDay: 1,
      onboarded: true,
      bills: {
        create: [
          // Vencimentos de outubro já confirmados: o ciclo atual é o do próximo vencimento.
          { name: "Aluguel", amountCents: euros(640), dueDay: 1, savedCents: euros(320), paidThrough: "2026-10-01", confirmedThrough: "2026-10-01", createdAt: at("2026-08-01") },
          { name: "Curso", amountCents: euros(125), dueDay: 10, savedCents: euros(31), paidThrough: "2026-10-10", confirmedThrough: "2026-10-10", createdAt: at("2026-08-01") },
          { name: "Telefone", amountCents: euros(20), dueDay: 20, savedCents: euros(5), paidThrough: "2026-10-20", confirmedThrough: "2026-10-20", createdAt: at("2026-08-01") },
        ],
      },
      goals: {
        create: [
          { name: "Renovação do visto", targetCents: euros(300), savedCents: euros(96), deadline: "2027-02", priority: 1, createdAt: at("2026-08-20") },
          { name: "Reserva de emergência", targetCents: euros(400), savedCents: euros(150), weeklyCents: euros(25), priority: 2, isEmergency: true, createdAt: at("2026-08-20") },
          { name: "Viagem", targetCents: euros(600), savedCents: euros(85), deadline: "2027-06", priority: 3, createdAt: at("2026-08-20") },
        ],
      },
    },
  });

  const outra = await db.user.create({
    data: { name: "Outra pessoa", weeklyLivingCents: euros(300), weekStartDay: 1, onboarded: true },
  });

  const gastos = [
    gasto(addDays(SEMANA_1, 36), euros(212), "Mercado"),
    gasto(addDays(SEMANA_1, 37), euros(96), "Transporte"),
    gasto(addDays(SEMANA_1, 38), euros(74), "Comer fora"),
    gasto(addDays(SEMANA_1, 39), euros(31), "Outro"),
  ];

  for (const t of [...seedTxs(), ...gastos]) {
    await db.transaction.create({
      data: {
        userId: lucas.id,
        type: t.type,
        amountCents: t.amountCents,
        category: t.category,
        date: at(t.date),
        groupId: t.groupId,
        shortfallCents: t.shortfallCents,
      },
    });
  }

  // Dados de outro usuário, só para provar o isolamento.
  await db.transaction.create({
    data: { userId: outra.id, type: "income", amountCents: euros(9999), date: at(addDays(SEMANA_1, 49)), shortfallCents: 0 },
  });
  await db.transaction.create({
    data: { userId: outra.id, type: "expense", amountCents: euros(777), category: "Mercado", date: at(addDays(SEMANA_1, 49)) },
  });
}

main().finally(() => db.$disconnect());
