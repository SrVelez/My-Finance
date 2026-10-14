import { expect, test } from "@playwright/test";

test("PWA: manifest instalável, ícones e service worker", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: "Finança", display: "standalone", start_url: "/", lang: "pt-BR" });
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);

  const sw = await request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-cache");

  await page.goto("/onboarding");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  const registered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.scope;
  });
  expect(registered).toMatch(/\/$/);
});

test("PWA: sem conexão mostra a página offline", async ({ page, context }) => {
  await page.goto("/onboarding");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.goto("/onboarding").catch(() => {});
  await expect(page.getByRole("heading", { name: "Sem conexão" })).toBeVisible();
  await context.setOffline(false);
});
