import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

function toAssetPath(absolute, root) {
  return `./${path.relative(root, absolute).split(path.sep).join("/")}`;
}

function localReference(value) {
  if (!value || /^(?:[a-z]+:|#|\/\/)/i.test(value)) return null;
  const clean = value.split(/[?#]/, 1)[0];
  if (!clean || clean === "." || clean === "./") return null;
  return clean.startsWith("./") ? clean : `./${clean.replace(/^\//, "")}`;
}

async function collectModuleGraph(root, entry, assets, visited = new Set()) {
  const absolute = path.resolve(root, entry);
  if (visited.has(absolute)) return;
  visited.add(absolute);
  assets.add(toAssetPath(absolute, root));
  const source = await readFile(absolute, "utf8");
  const importPattern = /(?:import|export)\s+(?:[^"']*?\s+from\s*)?["']([^"']+)["']/g;
  for (const match of source.matchAll(importPattern)) {
    if (!match[1].startsWith(".")) continue;
    const resolved = path.resolve(path.dirname(absolute), match[1]);
    await collectModuleGraph(root, toAssetPath(resolved, root), assets, visited);
  }
}

export async function discoverCoreAssets(root) {
  const assets = new Set(["./index.html"]);
  const index = await readFile(path.join(root, "index.html"), "utf8");
  for (const match of index.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
    const asset = localReference(match[1]);
    if (asset && asset !== "./sw.js") assets.add(asset);
  }

  const manifestPath = path.join(root, "manifest.webmanifest");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assets.add("./manifest.webmanifest");
  for (const icon of manifest.icons || []) {
    const asset = localReference(icon.src);
    if (asset) assets.add(asset);
  }

  const cssAssets = [...assets].filter((asset) => asset.endsWith(".css"));
  for (const cssAsset of cssAssets) {
    const css = await readFile(path.join(root, cssAsset.slice(2)), "utf8");
    for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      const reference = localReference(match[1]);
      if (!reference) continue;
      const resolved = path.resolve(path.dirname(path.join(root, cssAsset.slice(2))), reference);
      assets.add(toAssetPath(resolved, root));
    }
  }

  const moduleEntries = [...assets].filter((asset) => asset.endsWith(".js"));
  for (const entry of moduleEntries) await collectModuleGraph(root, entry, assets);
  return [...assets].sort();
}

export async function renderServiceWorker(root) {
  const template = await readFile(path.join(root, "sw.template.js"), "utf8");
  const packageJSON = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const assets = await discoverCoreAssets(root);
  const hash = createHash("sha256");
  hash.update(template);
  hash.update(packageJSON.version);
  for (const asset of assets) {
    hash.update(asset);
    hash.update(await readFile(path.join(root, asset.slice(2))));
  }
  const digest = hash.digest("hex");
  const cacheName = `openinglab-shell-${packageJSON.version}-${digest.slice(0, 16)}`;
  const source = template
    .replace("__CACHE_NAME__", cacheName)
    .replace("__CORE_ASSETS__", JSON.stringify(assets, null, 2));
  return { assets, cacheName, digest, source };
}
