import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const PRISMA_MESSAGE =
  "O banco só é acessado em lib/services (e lib/auth). Páginas, ações, rotas e componentes chamam um serviço com o userId da sessão.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Isolamento de dados por usuário: nada fora da camada de serviços fala direto com o Prisma.
  {
    files: ["**/*.{ts,tsx,mts,mjs,js}"],
    ignores: [
      "lib/services/**",
      "lib/auth/**",
      "lib/db.ts",
      // Fora do app: testes, seeds e scripts de manutenção usam o banco de propósito.
      "tests/**",
      "e2e/**",
      "prisma/**",
      "scripts/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@prisma/client", message: PRISMA_MESSAGE },
          ],
          patterns: [{ group: ["**/lib/db", "**/lib/db.ts"], message: PRISMA_MESSAGE }],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    "test-results/**",
    "playwright-report/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
