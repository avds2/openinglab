import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { APP_VERSION } from "../js/version.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJSON = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");

const errors = [];
if (APP_VERSION !== packageJSON.version) errors.push(`js/version.js is ${APP_VERSION}, but package.json is ${packageJSON.version}`);
if (!changelog.includes(`## [${APP_VERSION}]`)) errors.push(`CHANGELOG.md has no release heading for ${APP_VERSION}`);

if (errors.length) {
  console.error("Release version validation failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Release version consistent: ${APP_VERSION}.`);
}
