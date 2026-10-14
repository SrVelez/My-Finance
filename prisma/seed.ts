import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Estado base dos casos de teste (tela "Início", 8/out): ver Claude/tasks.md.
async function main() {
  await db.user.deleteMany();
  await db.user.create({
    data: {
      name: "Lucas",
      weeklyLivingCents: 12000,
      weekStartDay: 1,
      onboarded: true,
      bills: {
        create: [
          // Criado antes do vencimento de 1/out: aparece em "Já venceram" (como nas telas).
          { name: "Aluguel", amountCents: 64000, dueDay: 1, savedCents: 32000, paidThrough: "2026-10-01", createdAt: new Date("2026-09-01T00:00:00Z") },
          { name: "Curso", amountCents: 12500, dueDay: 10, savedCents: 12500 },
          { name: "Telefone", amountCents: 2000, dueDay: 20, savedCents: 1500 },
        ],
      },
      goals: {
        create: [
          { name: "Renovação do visto", targetCents: 30000, savedCents: 9600, deadline: "2027-02", weeklyCents: 0, priority: 1 },
          { name: "Reserva de emergência", targetCents: 40000, savedCents: 15000, deadline: null, weeklyCents: 2500, priority: 2, isEmergency: true },
          { name: "Viagem", targetCents: 60000, savedCents: 8500, deadline: "2027-06", weeklyCents: 0, priority: 3 },
        ],
      },
    },
  });
}

main().finally(() => db.$disconnect());
