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
    env: { DATABASE_URL: "file:./e2e.db", NEXT_DIST_DIR: ".next-e2e", NEXT_TSCONFIG: "tsconfig.e2e.json" },
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
