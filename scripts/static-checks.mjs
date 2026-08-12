import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { discoverCoreAssets } from "./lib/service-worker-build.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const index = await readFile(path.join(root, "index.html"), "utf8");
const css = await readFile(path.join(root, "css/styles.css"), "utf8");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.webmanifest"), "utf8"));
const packageJSON = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

const staticIds = [...index.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]);
const duplicateIds = staticIds.filter((id, indexValue) => staticIds.indexOf(id) !== indexValue);
if (duplicateIds.length) errors.push(`index.html contains duplicate IDs: ${[...new Set(duplicateIds)].join(", ")}`);

for (const match of index.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
  if (/^https?:/i.test(match[1])) errors.push(`index.html loads an external runtime resource: ${match[1]}`);
}
if (/url\(\s*["']?https?:/i.test(css)) errors.push("styles.css loads an external resource");
if (!manifest.start_url?.startsWith("./") || manifest.scope !== "./") errors.push("manifest start_url and scope must remain relative for subpath hosting");
if (packageJSON.dependencies && Object.keys(packageJSON.dependencies).length) errors.push("Runtime package dependencies are not allowed in the static app");

const assets = await discoverCoreAssets(root);
for (const asset of assets) {
  try {
    const info = await stat(path.join(root, asset.slice(2)));
    if (!info.isFile()) errors.push(`${asset} is not a file`);
  } catch {
    errors.push(`Missing internal runtime asset: ${asset}`);
  }
}

for (const asset of assets.filter((value) => value.endsWith(".js"))) {
  const source = await readFile(path.join(root, asset.slice(2)), "utf8");
  for (const match of source.matchAll(/(?:import|export)\s+(?:[^"']*?\s+from\s*)?["']([^"']+)["']/g)) {
    if (!match[1].startsWith(".")) errors.push(`${asset} imports a runtime dependency: ${match[1]}`);
  }
}

if (errors.length) {
  console.error(`Static checks failed with ${errors.length} issue${errors.length === 1 ? "" : "s"}:`);
  errors.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log(`Static checks passed: ${staticIds.length} static IDs and ${assets.length} internal runtime assets.`);
}
