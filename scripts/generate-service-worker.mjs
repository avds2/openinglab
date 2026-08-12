import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderServiceWorker } from "./lib/service-worker-build.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "sw.js");
const generated = await renderServiceWorker(root);

if (process.argv.includes("--check")) {
  const current = await readFile(output, "utf8").catch(() => "");
  if (current !== generated.source) {
    console.error("sw.js is stale. Run npm run sw:generate after changing a runtime asset.");
    process.exitCode = 1;
  } else {
    console.log(`Service worker current: ${generated.cacheName} (${generated.assets.length} offline assets).`);
  }
} else {
  await writeFile(output, generated.source);
  console.log(`Generated ${path.relative(root, output)} with ${generated.assets.length} offline assets (${generated.cacheName}).`);
}
