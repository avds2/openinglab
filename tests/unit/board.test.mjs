import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMove,
  createStartingPosition,
  positionAt,
  sideToMove,
} from "../../js/board.js";

test("the starting position contains the standard 32 pieces", () => {
  const position = createStartingPosition();
  assert.equal(Object.keys(position).length, 32);
  assert.equal(position.e1, "wK");
  assert.equal(position.d8, "bQ");
  assert.equal(position.a2, "wP");
  assert.equal(position.h7, "bP");
});

test("move playback creates the expected position without sharing state", () => {
  const moves = [
    { from: "e2", to: "e4" },
    { from: "e7", to: "e5" },
    { from: "g1", to: "f3" },
  ];
  const first = positionAt(moves, 1);
  const third = positionAt(moves, 3);
  assert.equal(first.e4, "wP");
  assert.equal(first.e2, undefined);
  assert.equal(first.g1, "wN");
  assert.equal(third.f3, "wN");
  assert.equal(third.e5, "bP");
});

test("castling, en passant, and promotion metadata are applied", () => {
  const castling = { e1: "wK", h1: "wR" };
  applyMove(castling, { from: "e1", to: "g1" });
  assert.deepEqual(castling, { f1: "wR", g1: "wK" });

  const enPassant = { e5: "wP", d5: "bP" };
  applyMove(enPassant, { from: "e5", to: "d6", enPassantCapture: "d5" });
  assert.deepEqual(enPassant, { d6: "wP" });

  const promotion = { a7: "wP" };
  applyMove(promotion, { from: "a7", to: "a8", promotion: "Q" });
  assert.equal(promotion.a8, "wQ");
});

test("sideToMove alternates by ply", () => {
  assert.equal(sideToMove(0), "White");
  assert.equal(sideToMove(1), "Black");
  assert.equal(sideToMove(12), "White");
});
