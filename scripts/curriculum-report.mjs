import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { OPENINGS } from "../js/openings/index.js";
import { curriculumDigest, curriculumStats } from "./lib/curriculum-validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(root, "curriculum-baseline.json");
const actual = {
  schemaVersion: 1,
  digest: curriculumDigest(OPENINGS),
  counts: curriculumStats(OPENINGS),
};

if (process.argv.includes("--write")) {
  await writeFile(baselinePath, `${JSON.stringify(actual, null, 2)}\n`);
  console.log(`Updated curriculum baseline: ${actual.counts.openings} openings, ${actual.counts.lines} lines, ${actual.counts.instructionalMoves} moves, ${actual.counts.questions} questions.`);
  process.exit(0);
}

const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const changes = [];
for (const key of Object.keys(actual.counts)) {
  if (baseline.counts?.[key] !== actual.counts[key]) changes.push(`${key}: expected ${baseline.counts?.[key] ?? "missing"}, found ${actual.counts[key]}`);
}
if (baseline.digest !== actual.digest) changes.push(`digest: expected ${baseline.digest}, found ${actual.digest}`);

if (changes.length) {
  console.error("Curriculum differs from the reviewed release baseline:");
  changes.forEach((change) => console.error(`- ${change}`));
  console.error("Review the content change, then run npm run curriculum:baseline only when the difference is intentional.");
  process.exitCode = 1;
} else {
  console.log(`Curriculum integrity unchanged: ${actual.counts.openings} openings, ${actual.counts.lines} lines, ${actual.counts.instructionalMoves} moves, ${actual.counts.questions} questions (${actual.digest.slice(0, 12)}).`);
}
