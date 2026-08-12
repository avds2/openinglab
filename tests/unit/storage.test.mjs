import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateQuizScore,
  ProgressStore,
  RECOVERY_STORAGE_KEY,
  STORAGE_KEY,
  STORAGE_VERSION,
} from "../../js/storage.js";
import { MemoryStorage } from "../helpers/memory-storage.mjs";

const CATALOG = [
  {
    id: "italian",
    mainLine: { id: "main", name: "Main" },
    variations: [
      { id: "giuoco-piano", name: "Giuoco Piano" },
      { id: "two-knights", name: "Two Knights" },
    ],
  },
  { id: "sicilian", mainLine: { id: "main", name: "Main" }, variations: [] },
];

function createClock(iso = "2026-08-12T10:00:00.000Z") {
  let current = new Date(iso);
  return {
    now: () => new Date(current),
    advanceDays(days) {
      current = new Date(current.getTime() + days * 24 * 60 * 60 * 1000);
    },
  };
}

test("progress persists, reloads, and derives mastery from one source of truth", () => {
  const storage = new MemoryStorage();
  const clock = createClock();
  const store = new ProgressStore(CATALOG, { storage, now: clock.now });

  store.completeLesson("italian");
  store.completePractice("italian");
  store.recordQuiz("italian", 4, 5);

  assert.equal(store.get("italian").mastered, true);
  assert.equal(store.openingPercent("italian"), 100);
  assert.equal(store.stats().mastered, 1);

  const reloaded = new ProgressStore(CATALOG, { storage, now: clock.now });
  assert.deepEqual(reloaded.get("italian"), store.get("italian"));
});

test("quiz scoring clamps malformed values and keeps the best result", () => {
  assert.deepEqual(calculateQuizScore(7, 5), { correct: 5, total: 5, percent: 100 });
  assert.deepEqual(calculateQuizScore(-2, 0), { correct: 0, total: 0, percent: 0 });

  const store = new ProgressStore(CATALOG, { storage: new MemoryStorage() });
  store.recordQuiz("italian", 3, 5);
  store.recordQuiz("italian", 2, 5);
  const progress = store.get("italian");
  assert.equal(progress.bestQuizScore, 60);
  assert.equal(progress.quizCorrect, 5);
  assert.equal(progress.quizAnswered, 10);
});

test("spaced review scheduling expands clean intervals and ranks due lines first", () => {
  const storage = new MemoryStorage();
  const clock = createClock();
  const store = new ProgressStore(CATALOG, { storage, now: clock.now });

  const first = store.recordLineReview("italian", "main", { completed: true, totalMoves: 5 });
  assert.equal(first.intervalDays, 1);
  assert.equal(first.accuracy, 100);

  clock.advanceDays(1);
  const second = store.recordLineReview("italian", "main", { completed: true, totalMoves: 5 });
  assert.equal(second.intervalDays, 3);
  assert.equal(second.currentStreak, 2);

  clock.advanceDays(4);
  const summary = store.reviewSummary(CATALOG.map((opening) => ({ ...opening, variations: opening.variations })));
  assert.equal(summary.due, 1);
  const queue = store.reviewQueue(CATALOG.map((opening) => ({ ...opening, variations: opening.variations })), 4);
  assert.equal(queue[0].opening.id, "italian");
  assert.equal(queue[0].lineKey, "main");
  assert.equal(queue[0].due, true);
});

test("export and import round-trip favorites, notes, reviews, and progress", () => {
  const clock = createClock();
  const first = new ProgressStore(CATALOG, { storage: new MemoryStorage(), now: clock.now });
  first.markVisited("italian");
  first.toggleFavorite("italian");
  first.setNote("italian", "Watch the f7 square.");
  first.recordLineReview("italian", "two-knights", { completed: true, totalMoves: 4, hints: 1 });

  const exported = first.exportJSON();
  const second = new ProgressStore(CATALOG, { storage: new MemoryStorage(), now: clock.now });
  const report = second.importJSON(exported);

  assert.equal(report.warnings.length, 0);
  assert.equal(second.isFavorite("italian"), true);
  assert.equal(second.get("italian").note, "Watch the f7 square.");
  assert.deepEqual(second.getLineReview("italian", "two-knights"), first.getLineReview("italian", "two-knights"));
});

test("legacy numeric review keys migrate to stable variation IDs", () => {
  const legacy = {
    version: 2,
    openings: { italian: { visited: true } },
    lineReviews: {
      "italian:1": { attempts: 1, completions: 1, accuracy: 90, intervalDays: 3 },
    },
  };
  const store = new ProgressStore(CATALOG, {
    storage: new MemoryStorage({ [STORAGE_KEY]: JSON.stringify(legacy) }),
  });

  assert.equal(store.getLineReview("italian", "two-knights").accuracy, 90);
  assert.equal(store.data.lineReviews["italian:1"], undefined);
  assert.match(store.getStartupWarning(), /normalized safely/);
});

test("unknown opening data and fields are preserved instead of discarded", () => {
  const store = new ProgressStore(CATALOG, { storage: new MemoryStorage() });
  const report = store.importJSON({
    app: "OpeningLab",
    data: {
      version: STORAGE_VERSION,
      openings: {
        italian: { visited: true, futureMetric: 42 },
        "removed-opening": { lessonComplete: true, note: "keep me" },
      },
      lineReviews: {
        "removed-opening:main": { attempts: 2 },
      },
    },
  });

  assert.ok(report.warnings.length >= 3);
  assert.equal(store.data.archived.openings["removed-opening"].note, "keep me");
  assert.equal(store.data.archived.openingFields.italian.futureMetric, 42);
  assert.equal(store.data.archived.lineReviews["removed-opening:main"].attempts, 2);
});

test("invalid imports and future schemas leave current progress unchanged", () => {
  const storage = new MemoryStorage();
  const store = new ProgressStore(CATALOG, { storage });
  store.completeLesson("italian");
  const before = store.exportJSON();

  assert.throws(() => store.importJSON("{broken"), /not valid JSON/);
  assert.throws(
    () => store.importJSON({ data: { version: STORAGE_VERSION + 1, openings: {} } }),
    /newer unsupported storage version/,
  );
  assert.equal(store.get("italian").lessonComplete, true);
  assert.equal(store.exportJSON().includes('"lessonComplete": true'), before.includes('"lessonComplete": true'));
});

test("corrupted local storage is preserved as a recovery copy", () => {
  const storage = new MemoryStorage({ [STORAGE_KEY]: "{not-json" });
  const store = new ProgressStore(CATALOG, { storage });

  assert.equal(store.get("italian").visited, false);
  assert.match(store.getStartupWarning(), /recovery copy/);
  const recovery = JSON.parse(storage.getItem(RECOVERY_STORAGE_KEY));
  assert.equal(recovery.records[0].raw, "{not-json");
});

test("failed writes are reported while in-memory progress remains usable", () => {
  const storage = new MemoryStorage();
  const store = new ProgressStore(CATALOG, { storage });
  storage.failWrites = true;
  store.markVisited("italian");

  assert.equal(store.get("italian").visited, true);
  assert.match(store.getPersistenceError(), /would not allow/);
});
