import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { euros } from "@/lib/money";

// Teste de caracterização de `weekStats`, com banco SQLite próprio (nunca o de desenvolvimento).
process.env.DATABASE_URL = "file:./vitest-weekstats.db";

const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("weekStats", () => {
  let db: typeof import("@/lib/db").db;
  let weekStats: typeof import("@/lib/services/state").weekStats;
  let userId: string;

  beforeAll(async () => {
    for (const f of ["vitest-weekstats.db", "vitest-weekstats.db-journal"]) rmSync(path.join(__dirname, "../prisma", f), { force: true });
    execSync("npx prisma db push --skip-generate", { stdio: "pipe", env: process.env });
    ({ db } = await import("@/lib/db"));
    ({ weekStats } = await import("@/lib/services/state"));

    const user = await db.user.create({ data: { name: "A", weeklyLivingCents: euros(120), onboarded: true } });
    const other = await db.user.create({ data: { name: "B", weeklyLivingCents: euros(120), onboarded: true } });
    userId = user.id;
    const tx = (uid: string, type: string, cents: number, date: string) =>
      db.transaction.create({ data: { userId: uid, type, amountCents: cents, date: at(date) } });

    // Semana de segunda 5/out a domingo 11/out
    await tx(userId, "income", euros(500), "2026-10-05");
    await tx(userId, "allocation", euros(196), "2026-10-05");
    await tx(userId, "allocation", euros(58), "2026-10-05");
    await tx(userId, "withdrawal", euros(10), "2026-10-06");
    await tx(userId, "expense", euros(30), "2026-10-07");
    await tx(userId, "expense", euros(20), "2026-10-11"); // último dia da semana: conta
    // Fora da semana (antes e depois) e de outro usuário: não contam
    await tx(userId, "income", euros(999), "2026-10-04");
    await tx(userId, "expense", euros(999), "2026-10-12");
    await tx(other.id, "income", euros(777), "2026-10-05");
  }, 60_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("livre = recebido − guardado + retirado; restante = livre − gastos", async () => {
    const w = await weekStats(userId, "2026-10-08", 1);
    expect(w).toMatchObject({ start: "2026-10-05", end: "2026-10-11" });
    expect(w.poolCents).toBe(euros(500 - 196 - 58 + 10));
    expect(w.spentCents).toBe(euros(50));
    expect(w.freeLeftCents).toBe(euros(500 - 196 - 58 + 10 - 50));
  });

  it("respeita o primeiro dia da semana escolhido (domingo)", async () => {
    const w = await weekStats(userId, "2026-10-08", 0);
    expect(w).toMatchObject({ start: "2026-10-04", end: "2026-10-10" });
    expect(w.poolCents).toBe(euros(999 + 500 - 196 - 58 + 10));
  });
});
