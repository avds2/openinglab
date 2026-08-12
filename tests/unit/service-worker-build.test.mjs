import assert from "node:assert/strict";
import { appendFile, cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { discoverCoreAssets, renderServiceWorker } from "../../scripts/lib/service-worker-build.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("generated service worker precaches the complete local runtime graph", async () => {
  const assets = await discoverCoreAssets(root);
  assert.ok(assets.includes("./index.html"));
  assert.ok(assets.includes("./css/styles.css"));
  assert.ok(assets.includes("./js/app.js"));
  assert.ok(assets.includes("./js/openings/catalog.js"));
  assert.ok(assets.includes("./manifest.webmanifest"));
  assert.equal(new Set(assets).size, assets.length);
});

test("generated cache identity changes whenever a shipped asset changes", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "openinglab-sw-"));
  try {
    await cp(root, temporaryRoot, {
      recursive: true,
      filter: (source) => !source.split(path.sep).some((segment) => [".git", "dist", "node_modules", "playwright-report", "test-results"].includes(segment)),
    });
    const before = await renderServiceWorker(temporaryRoot);
    await appendFile(path.join(temporaryRoot, "css/styles.css"), "\n/* simulated release */\n");
    const after = await renderServiceWorker(temporaryRoot);

    assert.notEqual(after.cacheName, before.cacheName);
    assert.notEqual(after.digest, before.digest);
    assert.match(after.source, new RegExp(after.cacheName));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("checked-in service worker exactly matches generated output", async () => {
  const generated = await renderServiceWorker(root);
  const checkedIn = await readFile(path.join(root, "sw.js"), "utf8");
  assert.equal(checkedIn, generated.source);
});
