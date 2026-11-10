import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEGACY_EMAIL } from "@/lib/auth/legacy";

// Caso 15: a migração mantém os dados de antes do login e o claim-legacy os transfere para a conta.
// Usa um banco criado com o schema ANTIGO (tests/fixtures/schema-before-login.prisma) e caminho absoluto.
const DB_FILE = path.resolve(__dirname, "../prisma/vitest-legacy.db");
process.env.DATABASE_URL = `file:${DB_FILE.replace(/\\/g, "/")}`;

describe("usuário legado (dados de antes do login)", () => {
  let db: typeof import("@/lib/db").db;
  let legacy: typeof import("@/lib/services/legacy");

  beforeAll(async () => {
    for (const f of ["", "-journal"]) rmSync(`${DB_FILE}${f}`, { force: true });
    // 1. Banco como era antes do login.
    execSync("npx prisma db push --skip-generate --schema tests/fixtures/schema-before-login.prisma", { stdio: "pipe", env: process.env });
    ({ db } = await import("@/lib/db"));
    legacy = await import("@/lib/services/legacy");

    // 2. Dados do usuário único local, inseridos direto (o cliente novo não conhece o schema antigo).
    const now = Date.now();
    await db.$executeRawUnsafe(
      `INSERT INTO "User" (id, name, weeklyLivingCents, weekStartDay, onboarded, createdAt) VALUES ('u-old', 'Lucas', 12000, 1, 1, ?)`,
      now,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "Bill" (id, userId, name, amountCents, dueDay, savedCents, createdAt) VALUES ('b1', 'u-old', 'Aluguel', 64000, 1, 32000, ?), ('b2', 'u-old', 'Curso', 12500, 10, 0, ?)`,
      now,
      now,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "Goal" (id, userId, name, targetCents, savedCents, priority, createdAt) VALUES ('g1', 'u-old', 'Viagem', 60000, 8500, 1, ?)`,
      now,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "Transaction" (id, userId, type, amountCents, date, createdAt) VALUES ('t1', 'u-old', 'income', 50000, ?, ?), ('t2', 'u-old', 'expense', 2350, ?, ?)`,
      now,
      now,
      now,
      now,
    );

    // 3. A migração: prepara o usuário e aplica o schema novo por cima.
    expect(await legacy.prepareLegacyUser()).toBe(1);
    execSync("npx prisma db push --skip-generate", { stdio: "pipe", env: process.env });
  }, 120_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("a migração mantém todos os dados e dá ao usuário existente o e-mail legado", async () => {
    const u = await db.user.findUniqueOrThrow({ where: { id: "u-old" } });
    expect(u).toMatchObject({ name: "Lucas", email: LEGACY_EMAIL, weeklyLivingCents: 12000, onboarded: true, emailVerified: false });
    expect((await db.bill.findMany({ where: { userId: "u-old" }, orderBy: { id: "asc" } })).map((b) => [b.name, b.savedCents, b.archivedAt])).toEqual([
      ["Aluguel", 32000, null],
      ["Curso", 0, null],
    ]);
    expect(await db.goal.count({ where: { userId: "u-old" } })).toBe(1);
    expect(await db.transaction.count({ where: { userId: "u-old" } })).toBe(2);
  });

  it("preparar de novo é inofensivo (idempotente)", async () => {
    expect(await legacy.prepareLegacyUser()).toBe(0);
    expect(await db.user.count()).toBe(1);
  });

  it("claim-legacy: recusa e-mail sem conta, e-mail legado e conta que já tem plano", async () => {
    expect(await legacy.claimLegacyData("naoexiste@x.dev")).toMatchObject({ ok: false });
    expect(await legacy.claimLegacyData(LEGACY_EMAIL)).toMatchObject({ ok: false });

    const cheia = await db.user.create({ data: { name: "Outra", email: "cheia@x.dev", onboarded: true } });
    await db.bill.create({ data: { userId: cheia.id, name: "Net", amountCents: 100, dueDay: 2 } });
    const r = await legacy.claimLegacyData("cheia@x.dev");
    expect(r).toEqual({ ok: false, error: "Essa conta já tem um plano salvo. Para não misturar dados, nada foi transferido." });
    expect(await db.bill.count({ where: { userId: "u-old" } })).toBe(2); // nada saiu do legado
  });

  it("claim-legacy: transfere tudo para a conta vazia (sem diferenciar maiúsculas) e apaga o legado", async () => {
    await db.user.create({ data: { name: "", email: "lucas@gmail.com" } });
    const r = await legacy.claimLegacyData("  Lucas@Gmail.com ");
    expect(r).toEqual({ ok: true, bills: 2, goals: 1, transactions: 2 });

    const conta = await db.user.findUniqueOrThrow({ where: { email: "lucas@gmail.com" } });
    expect(conta).toMatchObject({ name: "Lucas", weeklyLivingCents: 12000, weekStartDay: 1, onboarded: true });
    expect(await db.bill.count({ where: { userId: conta.id } })).toBe(2);
    expect(await db.goal.count({ where: { userId: conta.id } })).toBe(1);
    expect(await db.transaction.count({ where: { userId: conta.id } })).toBe(2);
    expect(await db.user.findUnique({ where: { email: LEGACY_EMAIL } })).toBeNull();
    expect(await db.bill.count({ where: { userId: "u-old" } })).toBe(0);

    // Sem legado, rodar de novo avisa em vez de falhar.
    expect(await legacy.claimLegacyData("lucas@gmail.com")).toEqual({ ok: false, error: "Não há dados legados para transferir." });
  });
});
