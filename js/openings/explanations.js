const FILES = "abcdefgh";
const CENTRAL_SQUARES = new Set(["c3", "c4", "c5", "c6", "d3", "d4", "d5", "d6", "e3", "e4", "e5", "e6", "f3", "f4", "f5", "f6"]);

const PAWN_IDEAS = {
  e2e4: "Advancing the e-pawn controls d5 and f5 while releasing the queen and the f1 bishop, so White can develop quickly around a central foothold.",
  e7e5: "Advancing the e-pawn controls d4 and f4 while releasing the queen and the f8 bishop, giving Black active and symmetrical development.",
  d2d4: "The d-pawn controls c5 and e5 and frees the c1 bishop, turning White's space into direct influence over the center.",
  d7d5: "The d-pawn controls c4 and e4 and frees the c8 bishop, so Black challenges White's center instead of conceding space.",
  c2c4: "The c-pawn attacks d5 from the flank and can open the c-file later, creating queenside pressure without fixing White's whole center.",
  c7c5: "The c-pawn attacks d4 from the flank and makes the structure asymmetrical, giving Black independent queenside counterplay.",
  c2c3: "The c-pawn supports a later d4 advance and builds a broad center, although it temporarily takes the c3 square from the queen's knight.",
  c7c6: "The c-pawn reinforces a later ...d5 break and gives Black a sturdy central base while keeping the light-squared bishop available.",
  d2d3: "The d-pawn secures e4 and opens the c1 bishop, choosing a controlled buildup before White commits to a larger central break.",
  d7d6: "The d-pawn reinforces e5 and opens the c8 bishop, giving Black a stable platform for completing development.",
  e2e3: "The e-pawn supports d4 and opens the f1 bishop, favoring a compact setup before White decides how much central space to claim.",
  e7e6: "The e-pawn supports d5 and opens the f8 bishop, creating a resilient center that Black can later challenge with ...c5.",
  f2f4: "The f-pawn attacks e5 and gains kingside space, but moving it also loosens the king, so rapid development becomes especially important.",
  f7f5: "The f-pawn attacks e4 and creates kingside counterplay, accepting some king exposure in exchange for immediate central pressure.",
  g2g3: "The pawn prepares Bg2, where the bishop can influence the long diagonal and the center without occupying it with another pawn.",
  g7g6: "The pawn prepares ...Bg7, placing the bishop on a long diagonal and supporting hypermodern control of the center.",
  b2b3: "The pawn prepares Bb2 and strengthens the long diagonal, giving White flexible central pressure from the queenside.",
  b7b6: "The pawn prepares ...Bb7 and builds queenside control, allowing Black's bishop to challenge the center from long range.",
  a2a3: "The rook-pawn move gains a useful retreat square and can prepare queenside expansion, but it is valuable only when that tempo serves the position.",
  a7a6: "The rook-pawn move questions a piece on b5 and prepares ...b5, gaining queenside space while forcing White to clarify the bishop's role.",
  h2h3: "The rook-pawn move denies an enemy piece the g4 square and gives the king luft, reducing future pins or back-rank problems.",
  h7h6: "The rook-pawn move denies an enemy piece the g5 square and creates luft, but Black must ensure the tempo does not delay development.",
};

function moveNotation(move) {
  return String(move.san || "").replace(/^\d+\.{1,3}\s*/, "");
}

function finishSentence(text) {
  const clean = String(text || "").trim();
  if (!clean) return "";
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function knightTargets(square) {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  return [
    [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
  ]
    .map(([df, dr]) => [file + df, rank + dr])
    .filter(([nextFile, nextRank]) => nextFile >= 0 && nextFile < 8 && nextRank >= 0 && nextRank < 8)
    .map(([nextFile, nextRank]) => `${FILES[nextFile]}${nextRank + 1}`)
    .sort((a, b) => Number(CENTRAL_SQUARES.has(b)) - Number(CENTRAL_SQUARES.has(a)));
}

function pawnPurpose(move, side, notation) {
  if (notation.includes("x")) {
    return `${side}'s pawn capture on ${move.to} resolves tension, changes the pawn structure, and opens new files or diagonals that both sides must reassess.`;
  }
  const known = PAWN_IDEAS[`${move.from}${move.to}`];
  if (known) return known;
  const direction = side === "White" ? 1 : -1;
  const file = FILES.indexOf(move.to[0]);
  const rank = Number(move.to[1]) + direction;
  const controls = [file - 1, file + 1].filter((value) => value >= 0 && value < 8).map((value) => `${FILES[value]}${rank}`);
  return `From ${move.to}, the pawn controls ${controls.join(" and ")}, gains space, and fixes part of the structure that will guide the next developing moves.`;
}

function piecePurpose(move, side, notation) {
  const type = notation.startsWith("O-O") ? "K" : /^[KQRBN]/.test(notation) ? notation[0] : "P";
  if (type === "P") return pawnPurpose(move, side, notation);
  if (type === "K" && notation.startsWith("O-O")) {
    return `${side} moves the king away from the center and activates a rook in one move, making future central play much safer.`;
  }
  if (notation.includes("x")) {
    return `The capture on ${move.to} removes an opposing unit and changes the tactical balance; the resulting open lines and possible recaptures matter as much as the material.`;
  }
  if (type === "N") {
    const targets = knightTargets(move.to).slice(0, 4);
    return `From ${move.to}, the knight influences ${targets.join(", ")}, improving coordination while bringing a short-range piece closer to the critical area.`;
  }
  if (type === "B") {
    const special = {
      g2: "From g2, the bishop works along the long diagonal through e4 and d5 toward b7, applying central and queenside pressure at the same time.",
      g7: "From g7, the bishop works along the long diagonal through e5 and d4 toward b2, applying central and queenside pressure at the same time.",
      c4: "From c4, the bishop develops toward the center and directly eyes f7, the least-protected pawn in Black's starting position.",
      c5: "From c5, the bishop develops actively and eyes f2, giving Black tactical pressure while preparing castling.",
    }[move.to];
    return special || `On ${move.to}, the bishop gains a useful diagonal, increases long-range pressure through the center, and helps ${side} complete development.`;
  }
  if (type === "R") return `The rook uses ${move.to} to support a file that is open or likely to open, converting development into direct central or queenside pressure.`;
  if (type === "Q") return `The queen on ${move.to} coordinates several pieces and connects threats, but its value depends on avoiding attacks that would hand the opponent free tempi.`;
  return `The king move to ${move.to} answers the position's immediate tactical requirement and aims to reach a safer square before play continues.`;
}

export function enrichMoveExplanation(move, index) {
  const original = finishSentence(move.explanation);
  const sentenceCount = (original.match(/[.!?](?:\s|$)/g) || []).length;
  if (original.length >= 96 || (sentenceCount >= 2 && original.length >= 72)) return move;

  const notation = moveNotation(move);
  const side = index % 2 === 0 ? "White" : "Black";
  let purpose = piecePurpose(move, side, notation);
  if (notation.includes("+") && !purpose.includes("check")) {
    purpose += " Because the move gives check, the opponent must respond before pursuing their own plan.";
  }
  return { ...move, explanation: `${original} ${purpose}`.trim() };
}
