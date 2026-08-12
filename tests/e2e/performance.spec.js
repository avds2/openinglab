import { expect, test } from "@playwright/test";

test("startup and home rendering stay within lightweight interaction budgets", async ({ page }) => {
  await page.goto("/#home");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const metrics = await page.evaluate(() => ({
    domNodes: document.querySelectorAll("*").length,
    runtimeResources: performance.getEntriesByType("resource").filter((entry) => new URL(entry.name).origin === location.origin).length,
  }));
  expect(metrics.domNodes).toBeLessThan(1_200);
  expect(metrics.runtimeResources).toBeLessThanOrEqual(24);
});
