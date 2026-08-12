import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function expectNoAxeViolations(page, label) {
  await page.waitForTimeout(450);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, `${label}:\n${results.violations.map((item) => `${item.id}: ${item.help}`).join("\n")}`).toEqual([]);
}

for (const [label, route] of [
  ["Learn library", "/#home"],
  ["Lesson overview", "/#opening/italian"],
  ["Guided practice", "/#opening/italian/practice/main/guided"],
  ["Quiz", "/#opening/italian/quiz"],
  ["Progress", "/#progress"],
]) {
  test(`${label} has no automatically detectable accessibility violations`, async ({ page }) => {
    await page.goto(route);
    await expectNoAxeViolations(page, label);
  });
}

test("reduced-motion preference suppresses meaningful animation", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4174",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/#home");
  const timing = await page.locator(".opening-card").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { animationDuration: style.animationDuration, transitionDuration: style.transitionDuration };
  });
  expect(parseFloat(timing.animationDuration)).toBeLessThanOrEqual(0.001);
  expect(parseFloat(timing.transitionDuration)).toBeLessThanOrEqual(0.001);
  await context.close();
});

test("the explicit light theme passes automated checks in core study contexts", async ({ page }) => {
  await page.goto("/#home");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  for (const [label, route] of [
    ["Light Learn library", "/#home"],
    ["Light Guided practice", "/#opening/italian/practice/main/guided"],
    ["Light Quiz", "/#opening/italian/quiz"],
  ]) {
    await page.goto(route);
    await expectNoAxeViolations(page, label);
  }
});
