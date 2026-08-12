/**
 * OpeningLab curriculum schema, version 1.
 *
 * The exported records are plain, serializable objects. They stay in ES modules
 * so shared move prefixes can be reused without extra network requests or a
 * build step. See FORMAT.md for the complete authoring contract.
 */
export const OPENING_SCHEMA_VERSION = 1;

export const defineMove = (from, to, san, explanation, extra = {}) => ({
  from,
  to,
  san,
  explanation,
  ...extra,
});

export const definePly = (from, to, notation, explanation, extra = {}) => ({
  from,
  to,
  notation,
  explanation,
  ...extra,
});

export const defineLineFromSegments = (name, ...segments) => ({
  name,
  moves: segments.flat().map(({ notation, ...move }, index) => ({
    ...move,
    san: `${Math.floor(index / 2) + 1}${index % 2 ? "... " : ". "}${notation}`,
  })),
});

export const defineQuizQuestion = (type, prompt, choices, answer, explanation, position = []) => ({
  type,
  prompt,
  choices,
  answer,
  explanation,
  position,
});

export const defineOpening = (opening) => ({
  schemaVersion: OPENING_SCHEMA_VERSION,
  ...opening,
});
