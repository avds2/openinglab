import { expect, test } from "@playwright/test";

import { OPENINGS } from "../../js/openings/index.js";

const italian = OPENINGS.find((opening) => opening.id === "italian");

async function chooseOpening(page, action, name = "Italian Game") {
  await page.getByRole("link", { name: new RegExp(`${action}: ${name}`) }).click();
}

async function playMainLineAsWhite(page, opening) {
  const learnerMoves = opening.mainLine.moves.filter((_, index) => index % 2 === 0);
  for (const [index, move] of learnerMoves.entries()) {
    await page.locator(`[data-square="${move.from}"]`).click();
    await page.locator(`[data-square="${move.to}"]`).click();
    if (index === 0) {
      await expect(page.locator(".coach-feedback-strip")).toContainText(`${move.san} was right`);
      await expect(page.locator("#practice-coach-content h2")).toContainText("Play White’s move");
    }
    if (index < learnerMoves.length - 1) {
      await expect(page.locator("#practice-board.is-interactive")).toBeVisible({ timeout: 4_000 });
    }
  }
}

test("opening selection through mastery persists favorites and notes", async ({ page }) => {
  await page.goto("/#home");
  await expect(page.getByRole("heading", { level: 1, name: "Build positions you understand." })).toBeVisible();
  await chooseOpening(page, "Open course");

  await page.getByRole("button", { name: /Save Italian Game to favorites/ }).click();
  await page.getByRole("tab", { name: "Moves" }).click();
  await page.getByRole("button", { name: "End" }).click();
  await expect(page.getByText("Lesson complete", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Ideas" }).click();
  await page.getByLabel("Your private note").fill("Watch f7 and connect every move to development.");
  await page.getByRole("tab", { name: "Practice" }).click();
  await page.getByRole("button", { name: /Start board practice/ }).click();

  await playMainLineAsWhite(page, italian);
  await expect(page.getByRole("heading", { name: new RegExp(`You reproduced ${italian.mainLine.name}`) })).toBeVisible({ timeout: 4_000 });
  await page.getByRole("link", { name: /Next review/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Remember the line, not just the lesson." })).toBeVisible();

  await page.getByRole("link", { name: "Quiz" }).click();
  await chooseOpening(page, "Choose a quiz");
  for (const [index, question] of italian.quiz.entries()) {
    await page.locator(`[data-answer="${question.answer}"]`).click();
    await page.getByRole("button", { name: index === italian.quiz.length - 1 ? /See results/ : /Next question/ }).click();
  }
  await expect(page.locator("#quiz-content .eyebrow", { hasText: "Quiz complete" })).toBeVisible();
  await expect(page.getByText(/mastery quiz threshold/)).toBeVisible();

  await page.getByRole("link", { name: "Learn" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await page.getByRole("button", { name: "Mastered", exact: true }).click();
  await expect(page.getByRole("link", { name: /Open course: Italian Game/ })).toBeVisible();
  await page.getByRole("button", { name: "Not mastered", exact: true }).click();
  await expect(page.getByRole("link", { name: /Open course: Italian Game/ })).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await chooseOpening(page, "Open course");
  await page.getByRole("tab", { name: "Ideas" }).click();
  await expect(page.getByLabel("Your private note")).toHaveValue("Watch f7 and connect every move to development.");
  await page.getByRole("link", { name: "Progress" }).click();
  await expect(page.getByText("Mastered", { exact: true }).first()).toBeVisible();
});

test("progress export and restore round-trip through the UI", async ({ page }) => {
  await page.goto("/#home");
  await chooseOpening(page, "Open course");
  await page.getByRole("button", { name: /Save Italian Game to favorites/ }).click();
  await page.getByRole("link", { name: "Progress" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const backup = Buffer.concat(chunks);

  await page.getByRole("button", { name: "Reset progress" }).click();
  await page.getByRole("button", { name: "Reset everything" }).click();
  await page.getByRole("button", { name: "Restore backup" }).click();
  await page.locator("#import-progress-file").setInputFiles({
    name: download.suggestedFilename(),
    mimeType: "application/json",
    buffer: backup,
  });
  await expect(page.locator("#toast")).toContainText("Progress restored");

  await page.getByRole("link", { name: "Learn" }).click();
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await expect(page.getByRole("link", { name: /Open course: Italian Game/ })).toBeVisible();
});

test("mobile move controls are thumb-reachable and touch interaction remains clear", async ({ browser }) => {
  const context = await browser.newContext({
    colorScheme: "dark",
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/#opening/italian");
  await page.getByRole("tab", { name: "Moves" }).tap();
  const controls = page.locator(".playback-controls");
  await controls.scrollIntoViewIfNeeded();

  const previous = await page.getByRole("button", { name: "Previous move", exact: true }).boundingBox();
  const next = await page.getByRole("button", { name: "Next move", exact: true }).boundingBox();
  const play = await page.getByRole("button", { name: /Play lesson/ }).boundingBox();
  const mobileNav = await page.locator(".main-nav").boundingBox();
  expect(previous.height).toBeGreaterThanOrEqual(48);
  expect(next.height).toBeGreaterThanOrEqual(48);
  expect(previous.y).toBeGreaterThan(play.y);
  expect(next.y).toBeGreaterThan(play.y);
  expect(Math.max(previous.y + previous.height, next.y + next.height)).toBeLessThanOrEqual(mobileNav.y);

  await page.getByRole("button", { name: "Next move", exact: true }).tap();
  await expect(page.locator(".move-counter")).toContainText("Ply 1 of");
  await page.locator(".main-nav").getByRole("link", { name: "Practice", exact: true }).tap();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await context.close();
});

test("keyboard users can control lesson playback and navigate the board", async ({ page }) => {
  await page.goto("/#opening/italian");
  await page.getByRole("tab", { name: "Moves" }).click();
  await page.locator("body").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".move-counter")).toContainText("Ply 1 of");

  await page.goto("/#opening/italian/practice/main/guided");
  const e2 = page.locator('[data-square="e2"]');
  await e2.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => page.evaluate(() => document.activeElement?.dataset?.square)).toBe("f2");
});

test("theme follows the system until the user makes an explicit choice", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4174",
    colorScheme: "light",
  });
  const page = await context.newPage();
  await page.goto("/#home");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme-source", "system");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme-source", "user");

  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme-source", "user");
  await context.close();
});
