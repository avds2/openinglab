import { ADDITIONAL_OPENINGS } from "./additional.js";
import { CORE_OPENINGS } from "./catalog.js";
import { enrichMoveExplanation } from "./explanations.js";
import { OPENING_VARIATIONS } from "./variations.js";
import { defineOpening, OPENING_SCHEMA_VERSION } from "./schema.js";

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function prepareLine(line, id) {
  return {
    ...line,
    id,
    moves: line.moves.map((move, index) => enrichMoveExplanation(move, index)),
  };
}

function prepareOpening(opening, extraVariations = []) {
  const lineNames = new Set([opening.mainLine.name.trim().toLowerCase()]);
  const lineIds = new Set(["main"]);
  const variations = [...opening.variations, ...extraVariations].map((variation) => {
    const name = variation.name.trim().toLowerCase();
    const id = variation.id || slugify(variation.name);
    if (lineNames.has(name)) throw new Error(`${opening.id}: duplicate line name "${variation.name}".`);
    if (!id || lineIds.has(id)) throw new Error(`${opening.id}: duplicate or empty variation id "${id}".`);
    lineNames.add(name);
    lineIds.add(id);
    return { ...variation, id };
  });
  return defineOpening({
    ...opening,
    mainLine: prepareLine(opening.mainLine, "main"),
    variations: variations.map((variation) => prepareLine(variation, variation.id || slugify(variation.name))),
  });
}

export { OPENING_SCHEMA_VERSION };

export const OPENINGS = [
  ...CORE_OPENINGS.map((opening) => prepareOpening(opening, OPENING_VARIATIONS[opening.id] || [])),
  ...ADDITIONAL_OPENINGS.map((opening) => prepareOpening(opening)),
];

export function getOpening(id) {
  return OPENINGS.find((opening) => opening.id === id) || null;
}

export function getLine(opening, key = "main") {
  if (!opening) return null;
  if (key === "main") return opening.mainLine;
  return opening.variations.find((variation) => variation.id === key) || opening.variations[Number(key)] || opening.mainLine;
}
