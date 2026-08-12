import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { discoverCoreAssets } from "./lib/service-worker-build.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const budget = JSON.parse(await readFile(path.join(root, "performance-budget.json"), "utf8"));

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}

const files = await filesUnder(dist);
const details = await Promise.all(files.map(async (file) => {
  const bytes = (await stat(file)).size;
  const contents = await readFile(file);
  return { file, bytes, gzipBytes: gzipSync(contents).byteLength };
}));
const sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);
const totalBytes = sum(details, (item) => item.bytes);
const gzipBytes = sum(details, (item) => item.gzipBytes);
const javascriptBytes = sum(details.filter((item) => item.file.endsWith(".js")), (item) => item.bytes);
const cssBytes = sum(details.filter((item) => item.file.endsWith(".css")), (item) => item.bytes);
const largest = details.reduce((current, item) => item.bytes > current.bytes ? item : current, { bytes: 0, file: "" });
const precachedAssets = (await discoverCoreAssets(root)).length;
const failures = [];

for (const [label, actual, maximum] of [
  ["total deploy bytes", totalBytes, budget.maxTotalBytes],
  ["summed gzip bytes", gzipBytes, budget.maxGzipBytes],
  ["JavaScript bytes", javascriptBytes, budget.maxJavaScriptBytes],
  ["CSS bytes", cssBytes, budget.maxCssBytes],
  ["largest asset bytes", largest.bytes, budget.maxSingleAssetBytes],
  ["deploy file count", files.length, budget.maxDeployFiles],
  ["precached asset count", precachedAssets, budget.maxPrecachedAssets],
]) {
  if (actual > maximum) failures.push(`${label}: ${actual} exceeds budget ${maximum}`);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
console.log(`Performance budget: ${kb(totalBytes)} raw, ${kb(gzipBytes)} gzip, ${kb(javascriptBytes)} JavaScript, ${kb(cssBytes)} CSS, ${files.length} files, ${precachedAssets} precached assets.`);
console.log(`Largest asset: ${path.relative(dist, largest.file)} (${kb(largest.bytes)}).`);
if (failures.length) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
