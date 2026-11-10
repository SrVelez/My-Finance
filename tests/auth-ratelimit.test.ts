import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Limite de tentativas por IP LIGADO (nos outros testes ele é desligado de propósito).
process.env.DATABASE_URL = "file:./vitest-ratelimit.db";
process.env.EMAIL_TRANSPORT = "memory";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.BETTER_AUTH_SECRET = "teste-teste-teste-teste-teste-teste-123456";
delete process.env.AUTH_RATE_LIMIT;

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

describe("limite de tentativas por IP", () => {
  let db: typeof import("@/lib/db").db;
  let auth: typeof import("@/lib/auth/auth").auth;

  beforeAll(async () => {
    for (const f of ["vitest-ratelimit.db", "vitest-ratelimit.db-journal"]) rmSync(path.join(__dirname, "../prisma", f), { force: true });
    execSync("npx prisma db push --skip-generate", { stdio: "pipe", env: process.env });
    ({ db } = await import("@/lib/db"));
    ({ auth } = await import("@/lib/auth/auth"));
  }, 90_000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  it("depois de muitos pedidos de código do mesmo IP, responde 429 (guardado no banco)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      const res = await auth.handler(
        new Request("http://localhost:3000/api/auth/email-otp/send-verification-otp", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": "203.0.113.7" },
          body: JSON.stringify({ email: `pessoa${i}@teste.dev`, type: "sign-in" }),
        }),
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(10)).toContain(429);
    expect(await db.rateLimit.count()).toBeGreaterThan(0);
  });

  it("outro IP não é afetado", async () => {
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": "198.51.100.9" },
        body: JSON.stringify({ email: "outro@teste.dev", type: "sign-in" }),
      }),
    );
    expect(res.status).toBe(200);
  });
});
