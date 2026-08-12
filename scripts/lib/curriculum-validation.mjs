import { createHash } from "node:crypto";

import { applyMove, createStartingPosition } from "../../js/board.js";
import { OPENING_SCHEMA_VERSION } from "../../js/openings/schema.js";

const SQUARE = /^[a-h][1-8]$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAN = /^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)$/;
const PIECE_LETTER = { P: "", N: "N", B: "B", R: "R", Q: "Q", K: "K" };

const isRecord = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value) => typeof value === "string" && value.trim().length > 0;
const cleanSAN = (value) => String(value).replace(/^\d+\.{1,3}\s*/, "").trim();

function error(errors, path, message) {
  errors.push(`${path}: ${message}`);
}

function requireText(errors, path, value) {
  if (!text(value)) error(errors, path, "is required and must be non-empty text");
}

function requireTextArray(errors, path, value, minimum = 1) {
  if (!Array.isArray(value) || value.length < minimum) {
    error(errors, path, `must contain at least ${minimum} item${minimum === 1 ? "" : "s"}`);
    return;
  }
  value.forEach((item, index) => requireText(errors, `${path}[${index}]`, item));
}

function pathIsClear(position, from, to) {
  const fileDelta = Math.sign(to.charCodeAt(0) - from.charCodeAt(0));
  const rankDelta = Math.sign(Number(to[1]) - Number(from[1]));
  let file = from.charCodeAt(0) + fileDelta;
  let rank = Number(from[1]) + rankDelta;
  while (`${String.fromCharCode(file)}${rank}` !== to) {
    if (position[`${String.fromCharCode(file)}${rank}`]) return false;
    file += fileDelta;
    rank += rankDelta;
  }
  return true;
}

function pseudoLegal(position, piece, move) {
  const fromFile = move.from.charCodeAt(0) - 97;
  const toFile = move.to.charCodeAt(0) - 97;
  const fromRank = Number(move.from[1]);
  const toRank = Number(move.to[1]);
  const df = toFile - fromFile;
  const dr = toRank - fromRank;
  const type = piece[1];

  if (type === "P") {
    const direction = piece[0] === "w" ? 1 : -1;
    const startingRank = piece[0] === "w" ? 2 : 7;
    if (df === 0 && dr === direction && !position[move.to]) return true;
    if (df === 0 && dr === direction * 2 && fromRank === startingRank && !position[move.to]) {
      const middle = `${move.from[0]}${fromRank + direction}`;
      return !position[middle];
    }
    if (Math.abs(df) === 1 && dr === direction) {
      return Boolean(position[move.to] || move.enPassantCapture);
    }
    return false;
  }
  if (type === "N") return (Math.abs(df) === 1 && Math.abs(dr) === 2) || (Math.abs(df) === 2 && Math.abs(dr) === 1);
  if (type === "K") {
    if (Math.max(Math.abs(df), Math.abs(dr)) === 1) return true;
    if (dr === 0 && Math.abs(df) === 2 && ["e1", "e8"].includes(move.from)) return pathIsClear(position, move.from, move.to);
    return false;
  }
  if (type === "B") return Math.abs(df) === Math.abs(dr) && pathIsClear(position, move.from, move.to);
  if (type === "R") return (df === 0 || dr === 0) && pathIsClear(position, move.from, move.to);
  if (type === "Q") return (df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr)) && pathIsClear(position, move.from, move.to);
  return false;
}

function validateMove(errors, path, move, index, position) {
  if (!isRecord(move)) {
    error(errors, path, "must be an object");
    return;
  }
  if (!SQUARE.test(move.from || "")) error(errors, `${path}.from`, "must be a valid board coordinate");
  if (!SQUARE.test(move.to || "")) error(errors, `${path}.to`, "must be a valid board coordinate");
  if (move.from === move.to) error(errors, path, "origin and destination must differ");
  requireText(errors, `${path}.san`, move.san);
  requireText(errors, `${path}.explanation`, move.explanation);
  if (text(move.explanation) && move.explanation.trim().length < 32) {
    error(errors, `${path}.explanation`, "must explain the move's purpose, not just name the action");
  }
  if (!SQUARE.test(move.from || "") || !SQUARE.test(move.to || "")) return;

  const expectedPrefix = `${Math.floor(index / 2) + 1}${index % 2 ? "..." : "."} `;
  if (!String(move.san).startsWith(expectedPrefix)) {
    error(errors, `${path}.san`, `must use the display prefix "${expectedPrefix.trim()}" for ply ${index + 1}`);
  }
  const notation = cleanSAN(move.san);
  if (!SAN.test(notation)) error(errors, `${path}.san`, `contains unsupported or malformed SAN display notation "${notation}"`);

  const piece = position[move.from];
  const expectedColor = index % 2 === 0 ? "w" : "b";
  if (!piece) {
    error(errors, path, `cannot move from empty square ${move.from}`);
    return;
  }
  if (piece[0] !== expectedColor) error(errors, path, `moves ${piece[0] === "w" ? "White" : "Black"} out of turn`);
  const target = position[move.to];
  if (target?.[0] === piece[0]) error(errors, path, `captures a friendly piece on ${move.to}`);
  if (!pseudoLegal(position, piece, move)) error(errors, path, `${piece} cannot move from ${move.from} to ${move.to} in this position`);

  const sanPiece = notation.startsWith("O-O") ? "K" : /^[KQRBN]/.test(notation) ? notation[0] : "";
  if (sanPiece !== PIECE_LETTER[piece[1]]) {
    error(errors, `${path}.san`, `piece designator does not match ${piece} on ${move.from}`);
  }
  const sanCaptures = notation.includes("x");
  const boardCaptures = Boolean(target || move.enPassantCapture);
  if (sanCaptures !== boardCaptures) error(errors, `${path}.san`, "capture marker does not match the board position");

  if (move.promotion && !["Q", "R", "B", "N"].includes(move.promotion)) {
    error(errors, `${path}.promotion`, "must be Q, R, B, or N");
  }
  if (move.enPassantCapture && !SQUARE.test(move.enPassantCapture)) {
    error(errors, `${path}.enPassantCapture`, "must be a valid board coordinate");
  }
  applyMove(position, move);
}

function startingMoveTokens(value) {
  if (!text(value)) return [];
  return value
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/^\d+\.{1,3}/, ""))
    .filter(Boolean);
}

function validateLine(errors, path, line, opening, seenLineIds, seenLineNames, requireOpeningPrefix = false) {
  if (!isRecord(line)) {
    error(errors, path, "must be an object");
    return;
  }
  requireText(errors, `${path}.id`, line.id);
  requireText(errors, `${path}.name`, line.name);
  if (text(line.id) && !ID.test(line.id)) error(errors, `${path}.id`, "must be lowercase kebab-case");
  if (seenLineIds.has(line.id)) error(errors, `${path}.id`, `duplicates line id "${line.id}"`);
  if (seenLineNames.has(String(line.name).trim().toLowerCase())) error(errors, `${path}.name`, `duplicates line name "${line.name}"`);
  seenLineIds.add(line.id);
  seenLineNames.add(String(line.name).trim().toLowerCase());

  if (!Array.isArray(line.moves) || line.moves.length < 4) {
    error(errors, `${path}.moves`, "must contain at least four instructional plies");
    return;
  }
  const position = createStartingPosition();
  line.moves.forEach((move, index) => validateMove(errors, `${path}.moves[${index}]`, move, index, position));

  const expectedPrefix = startingMoveTokens(opening.startingMoves);
  const actualPrefix = line.moves.slice(0, expectedPrefix.length).map((move) => cleanSAN(move.san));
  if (requireOpeningPrefix && expectedPrefix.length && expectedPrefix.join(" ") !== actualPrefix.join(" ")) {
    error(errors, `${path}.moves`, `must begin with opening sequence "${opening.startingMoves}"`);
  }
}

function validateQuiz(errors, path, question, opening) {
  if (!isRecord(question)) {
    error(errors, path, "must be an object");
    return;
  }
  requireText(errors, `${path}.type`, question.type);
  requireText(errors, `${path}.prompt`, question.prompt);
  requireText(errors, `${path}.explanation`, question.explanation);
  if (!Array.isArray(question.choices) || question.choices.length < 2 || question.choices.length > 6) {
    error(errors, `${path}.choices`, "must contain between two and six answers");
  } else {
    question.choices.forEach((choice, choiceIndex) => requireText(errors, `${path}.choices[${choiceIndex}]`, choice));
    if (new Set(question.choices.map((choice) => String(choice).trim().toLowerCase())).size !== question.choices.length) {
      error(errors, `${path}.choices`, "contains duplicate answers");
    }
  }
  if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer >= (question.choices?.length || 0)) {
    error(errors, `${path}.answer`, "must reference an existing answer index");
  }
  if (question.lineId) {
    const lineIds = new Set([opening.mainLine.id, ...opening.variations.map((variation) => variation.id)]);
    if (!lineIds.has(question.lineId)) error(errors, `${path}.lineId`, `references unknown line "${question.lineId}"`);
  }
  if (question.ply !== undefined && (!Number.isInteger(question.ply) || question.ply < 0 || question.ply > opening.mainLine.moves.length)) {
    error(errors, `${path}.ply`, "must reference a ply in the main line");
  }
  if (question.position !== undefined && !Array.isArray(question.position)) {
    error(errors, `${path}.position`, "must be an array when provided");
  }
  if (question.id && !ID.test(question.id)) error(errors, `${path}.id`, "must be lowercase kebab-case");
}

export function curriculumStats(openings) {
  return {
    openings: openings.length,
    variations: openings.reduce((total, opening) => total + opening.variations.length, 0),
    lines: openings.reduce((total, opening) => total + opening.variations.length + 1, 0),
    instructionalMoves: openings.reduce(
      (total, opening) => total + opening.mainLine.moves.length + opening.variations.reduce((sum, variation) => sum + variation.moves.length, 0),
      0,
    ),
    questions: openings.reduce((total, opening) => total + opening.quiz.length, 0),
  };
}

export function curriculumDigest(openings) {
  const stable = openings.map((opening) => ({
    id: opening.id,
    mainLine: {
      id: opening.mainLine.id,
      moves: opening.mainLine.moves.map(({ from, to, san }) => ({ from, to, san })),
    },
    variations: opening.variations.map((variation) => ({
      id: variation.id,
      moves: variation.moves.map(({ from, to, san }) => ({ from, to, san })),
    })),
    quiz: opening.quiz.map(({ prompt, choices, answer }) => ({ prompt, choices, answer })),
  }));
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export function validateCurriculum(openings) {
  const errors = [];
  if (!Array.isArray(openings) || openings.length === 0) return { valid: false, errors: ["curriculum: must contain at least one opening"], stats: null, digest: null };
  const openingIds = new Set();

  openings.forEach((opening, openingIndex) => {
    const path = `openings[${openingIndex}]`;
    if (!isRecord(opening)) {
      error(errors, path, "must be an object");
      return;
    }
    requireText(errors, `${path}.id`, opening.id);
    requireText(errors, `${path}.name`, opening.name);
    if (text(opening.id) && !ID.test(opening.id)) error(errors, `${path}.id`, "must be lowercase kebab-case");
    if (openingIds.has(opening.id)) error(errors, `${path}.id`, `duplicates opening id "${opening.id}"`);
    openingIds.add(opening.id);
    if (opening.schemaVersion !== OPENING_SCHEMA_VERSION) error(errors, `${path}.schemaVersion`, `must equal ${OPENING_SCHEMA_VERSION}`);
    if (!["White", "Black"].includes(opening.side)) error(errors, `${path}.side`, "must be White or Black");
    if (!["Beginner", "Intermediate", "Advanced"].includes(opening.difficulty)) error(errors, `${path}.difficulty`, "uses an unsupported level");
    requireTextArray(errors, `${path}.style`, opening.style);
    if (Array.isArray(opening.style) && new Set(opening.style).size !== opening.style.length) error(errors, `${path}.style`, "contains duplicate tags");
    ["startingMoves", "character", "skillLevel", "glyph", "intro", "pawnStructure", "memoryTip"].forEach((field) => requireText(errors, `${path}.${field}`, opening[field]));
    requireTextArray(errors, `${path}.objectives`, opening.objectives, 2);
    requireTextArray(errors, `${path}.mistakes`, opening.mistakes, 2);
    if (!isRecord(opening.plans)) error(errors, `${path}.plans`, "must contain White and Black plans");
    else {
      requireTextArray(errors, `${path}.plans.white`, opening.plans.white, 2);
      requireTextArray(errors, `${path}.plans.black`, opening.plans.black, 2);
    }
    if (!Array.isArray(opening.keySquares) || opening.keySquares.length < 1) error(errors, `${path}.keySquares`, "must contain at least one key square");
    else {
      const squares = new Set();
      opening.keySquares.forEach((item, itemIndex) => {
        if (!SQUARE.test(item?.square || "")) error(errors, `${path}.keySquares[${itemIndex}].square`, "must be a valid coordinate");
        requireText(errors, `${path}.keySquares[${itemIndex}].label`, item?.label);
        if (squares.has(item?.square)) error(errors, `${path}.keySquares[${itemIndex}].square`, "duplicates a key square");
        squares.add(item?.square);
      });
    }

    const seenLineIds = new Set();
    const seenLineNames = new Set();
    validateLine(errors, `${path}.mainLine`, opening.mainLine, opening, seenLineIds, seenLineNames, true);
    if (opening.mainLine?.id !== "main") error(errors, `${path}.mainLine.id`, "must be \"main\"");
    if (!Array.isArray(opening.variations) || opening.variations.length < 5) error(errors, `${path}.variations`, "must contain at least five important variations");
    else opening.variations.forEach((variation, index) => validateLine(errors, `${path}.variations[${index}]`, variation, opening, seenLineIds, seenLineNames));

    if (!Array.isArray(opening.quiz) || opening.quiz.length < 5) error(errors, `${path}.quiz`, "must contain at least five questions");
    else opening.quiz.forEach((question, index) => validateQuiz(errors, `${path}.quiz[${index}]`, question, opening));
  });

  return {
    valid: errors.length === 0,
    errors,
    stats: curriculumStats(openings),
    digest: curriculumDigest(openings),
  };
}
