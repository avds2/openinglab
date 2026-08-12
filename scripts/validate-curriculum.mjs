import { OPENINGS } from "../js/openings/index.js";
import { validateCurriculum } from "./lib/curriculum-validation.mjs";

const result = validateCurriculum(OPENINGS);
if (!result.valid) {
  console.error(`Curriculum validation failed with ${result.errors.length} issue${result.errors.length === 1 ? "" : "s"}:`);
  result.errors.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  const { openings, variations, lines, instructionalMoves, questions } = result.stats;
  console.log(`Curriculum valid: ${openings} openings, ${variations} variations, ${lines} lines, ${instructionalMoves} instructional moves, ${questions} questions.`);
  console.log(`Curriculum digest: ${result.digest}`);
}
