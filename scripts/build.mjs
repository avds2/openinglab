import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderServiceWorker } from "./lib/service-worker-build.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const item of ["index.html", "manifest.webmanifest", "LICENSE", "assets", "css", "js"]) {
  await cp(path.join(root, item), path.join(output, item), { recursive: true });
}
const worker = await renderServiceWorker(root);
await writeFile(path.join(output, "sw.js"), worker.source);
await writeFile(path.join(output, ".nojekyll"), "");

console.log(`Built dist with ${worker.assets.length} precached assets (${worker.cacheName}).`);
