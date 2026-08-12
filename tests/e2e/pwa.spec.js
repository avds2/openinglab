import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workerPath = path.join(root, "dist/sw.js");
const stylesheetPath = path.join(root, "dist/css/styles.css");

async function ensureControlled(page) {
  await page.goto("/#home");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

test("the installed app starts and navigates offline with a complete app shell", async ({ page, context }) => {
  await ensureControlled(page);
  const cacheState = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith("openinglab-shell-"));
    const cache = await caches.open(names[0]);
    return { names, entries: (await cache.keys()).map((request) => new URL(request.url).pathname) };
  });
  expect(cacheState.names).toHaveLength(1);
  expect(cacheState.entries).toContain("/index.html");
  expect(cacheState.entries).toContain("/js/openings/catalog.js");
  expect(cacheState.entries).toContain("/css/styles.css");

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Build positions you understand." })).toBeVisible();
  await page.getByRole("link", { name: "Review", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Remember the line, not just the lesson." })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Remember the line, not just the lesson." })).toBeVisible();
});

test("a missing cached asset is recovered from the network and recached", async ({ page }) => {
  await ensureControlled(page);
  await page.evaluate(async () => {
    const name = (await caches.keys()).find((key) => key.startsWith("openinglab-shell-"));
    const cache = await caches.open(name);
    await cache.delete(new URL("/css/styles.css", location.origin).href);
  });
  await page.reload();
  await expect(page.locator(".site-header")).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const name = (await caches.keys()).find((key) => key.startsWith("openinglab-shell-"));
    return Boolean(await (await caches.open(name)).match(new URL("/css/styles.css", location.origin).href));
  })).toBe(true);
});

test("a new deployment waits for consent, replaces the worker, and retires the old cache", async ({ page }) => {
  const originalWorker = await readFile(workerPath, "utf8");
  const originalStyles = await readFile(stylesheetPath, "utf8");
  const deployedCache = `openinglab-shell-1.0.0-lifecycle-${Date.now()}`;
  const updatedWorker = originalWorker.replace(
    /const CACHE_NAME = "openinglab-shell-[^"]+";/,
    `const CACHE_NAME = "${deployedCache}";`,
  );

  try {
    await ensureControlled(page);
    await writeFile(stylesheetPath, `${originalStyles}\n/* lifecycle release ${deployedCache} */\n`);
    await writeFile(workerPath, updatedWorker);
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((registration) => registration.update()));

    const notice = page.locator("#pwa-update-notice");
    await expect(notice).toBeVisible({ timeout: 10_000 });
    await expect(notice).toContainText("A new OpeningLab version is ready");
    await page.locator("#pwa-update-apply").click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => page.evaluate(async (expected) => {
      const names = (await caches.keys()).filter((name) => name.startsWith("openinglab-shell-"));
      return names.length === 1 && names[0] === expected;
    }, deployedCache), { timeout: 10_000 }).toBe(true);
  } finally {
    await writeFile(stylesheetPath, originalStyles);
    await writeFile(workerPath, originalWorker);
  }
});
