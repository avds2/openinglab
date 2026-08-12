import assert from "node:assert/strict";
import test from "node:test";

import { OPENINGS } from "../../js/openings/index.js";
import { curriculumStats, validateCurriculum } from "../../scripts/lib/curriculum-validation.mjs";

test("the complete curriculum satisfies the authoring contract", () => {
  const result = validateCurriculum(OPENINGS);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.deepEqual(result.stats, {
    openings: 20,
    variations: 116,
    lines: 136,
    instructionalMoves: 1552,
    questions: 100,
  });
  assert.match(result.digest, /^[a-f0-9]{64}$/);
});

test("validation rejects duplicate IDs, malformed moves, and broken quiz references", () => {
  const fixture = structuredClone(OPENINGS);
  fixture[1].id = fixture[0].id;
  fixture[0].variations[0].id = fixture[0].mainLine.id;
  fixture[0].mainLine.moves[0].from = "z9";
  fixture[0].quiz[0].answer = 99;
  fixture[0].quiz[1].lineId = "missing-line";

  const result = validateCurriculum(fixture);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes("duplicates opening id")));
  assert.ok(result.errors.some((message) => message.includes("duplicates line id")));
  assert.ok(result.errors.some((message) => message.includes("valid board coordinate")));
  assert.ok(result.errors.some((message) => message.includes("existing answer index")));
  assert.ok(result.errors.some((message) => message.includes("references unknown line")));
});

test("curriculum statistics expose content regressions directly", () => {
  const shortened = structuredClone(OPENINGS);
  shortened.pop();
  const stats = curriculumStats(shortened);
  assert.equal(stats.openings, 19);
  assert.ok(stats.instructionalMoves < 1552);
  assert.ok(stats.questions < 100);
});
