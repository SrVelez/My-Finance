import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { euros } from "@/lib/money";

// Teste de integração: banco SQLite próprio (nunca o de desenvolvimento).
process.env.DATABASE_URL = "file:./vitest.db";

const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("isolamento entre usuários", () => {
  let db: typeof import("@/lib/db").db;
  let getDashboardFor: typeof import("@/lib/services/dashboard").getDashboardFor;
  let a: { id: string; weekStartDay: number; weeklyLivingCents: number };

  beforeAll(async () => {
    // Banco novo a cada execução: apaga só o arquivo de teste e cria o schema do zero.
    for (const f of ["vitest.db", "vitest.db-journal"]) rmSync(path.join(__dirname, "../../prisma", f), { force: true });
    execSync("npx prisma db push --skip-generate", { stdio: "pipe", env: process.env });
    ({ db } = await import("@/lib/db"));
    ({ getDashboardFor } = await import("@/lib/services/dashboard"));

    a = await db.user.create({ data: { name: "A", weeklyLivingCents: euros(120), onboarded: true } });
    const b = await db.user.create({ data: { name: "B", weeklyLivingCents: euros(120), onboarded: true } });

    await db.transaction.create({ data: { userId: a.id, type: "income", amountCents: euros(500), date: at("2026-10-20"), shortfallCents: 0 } });
    await db.transaction.create({ data: { userId: a.id, type: "expense", amountCents: euros(40), category: "Mercado", date: at("2026-10-21") } });
    await db.goal.create({ data: { userId: a.id, name: "Meta de A", targetCents: euros(100), priority: 1 } });

    await db.transaction.create({ data: { userId: b.id, type: "income", amountCents: euros(9999), date: at("2026-10-20"), shortfallCents: 0 } });
    await db.transaction.create({ data: { userId: b.id, type: "expense", amountCents: euros(777), category: "Transporte", date: at("2026-10-21") } });
    await db.goal.create({ data: { userId: b.id, name: "Meta de B", targetCents: euros(100), priority: 1 } });
    await db.bill.create({ data: { userId: b.id, name: "Conta de B", amountCents: euros(500), dueDay: 5 } });
  }, 60_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("7. o segundo usuário nunca aparece nos dados do primeiro", async () => {
    const d = await getDashboardFor(a, "mes", "2026-10-22");
    expect(d.destaques.recebidoCents).toBe(euros(500));
    expect(d.categorias?.map((c) => c.categoria)).toEqual(["Mercado"]);
    expect(d.metas.map((m) => m.nome)).toEqual(["Meta de A"]);
    expect(d.proximoMes.totalCents).toBe(0);
    expect(d.dadosSuficientes.recebimentosTotais).toBe(1);
    expect(JSON.stringify(d)).not.toContain("9999");
  });
});
