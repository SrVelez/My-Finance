import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, ...devices["Pixel 7"] },
  webServer: {
    // Banco separado (prisma/e2e.db) para não tocar nos dados de desenvolvimento.
    command: `npx prisma db push --skip-generate && npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/onboarding`,
    env: {
      DATABASE_URL: "file:./e2e.db",
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_TSCONFIG: "tsconfig.e2e.json",
      // Login nos testes: o código vai para um arquivo (nunca para o terminal nem para e-mail) e o
      // limite por IP fica desligado, porque todos os testes entram da mesma máquina.
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      BETTER_AUTH_SECRET: "e2e-e2e-e2e-e2e-e2e-e2e-e2e-e2e-0123456789",
      EMAIL_TRANSPORT: "file",
      EMAIL_FILE: path.resolve(".otp-e2e", "outbox.jsonl"),
      AUTH_RATE_LIMIT: "off",
    },
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
