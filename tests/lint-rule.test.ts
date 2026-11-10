import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Caso 16: a regra de lint falha se um arquivo fora de lib/services (e lib/auth) importar o Prisma.
const lint = async (filePath: string, code: string) => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports");
};

describe("regra: o banco só é acessado pela camada de serviços", () => {
  const prismaClient = `import { PrismaClient } from "@prisma/client";\nexport const x = new PrismaClient();\n`;
  const dbImport = `import { db } from "@/lib/db";\nexport const y = db;\n`;
  const relativeDb = `import { db } from "../../lib/db";\nexport const z = db;\n`;

  it("falha em páginas, ações, rotas e componentes", async () => {
    for (const file of [
      "app/(app)/page.tsx",
      "app/(app)/contas/actions.ts",
      "app/api/dashboard/route.ts",
      "components/AdjustBalance.tsx",
      "lib/dashboard/index.ts",
    ]) {
      expect((await lint(file, prismaClient)).length, `${file} importando @prisma/client`).toBe(1);
      expect((await lint(file, dbImport)).length, `${file} importando @/lib/db`).toBe(1);
    }
    expect((await lint("app/(app)/page.tsx", relativeDb)).length).toBe(1);
  }, 60_000);

  it("é permitido em lib/services e lib/auth", async () => {
    for (const file of ["lib/services/bills.ts", "lib/services/legacy.ts", "lib/auth/session.ts"]) {
      expect(await lint(file, prismaClient), file).toEqual([]);
      expect(await lint(file, dbImport), file).toEqual([]);
    }
  }, 60_000);

  it("testes, e2e, seeds e scripts de manutenção podem usar o banco", async () => {
    for (const file of ["tests/x.test.ts", "e2e/x.spec.ts", "prisma/seed.ts", "scripts/claim-legacy.ts"]) {
      expect(await lint(file, prismaClient), file).toEqual([]);
    }
  }, 60_000);
});
