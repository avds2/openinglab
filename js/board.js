import { PIECE_SVGS } from "./pieces.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];

const PIECE_NAMES = {
  K: "king",
  Q: "queen",
  R: "rook",
  B: "bishop",
  N: "knight",
  P: "pawn",
};

export function createStartingPosition() {
  const board = {};
  const backRank = ["R", "N", "B", "Q", "K", "B", "N", "R"];

  FILES.forEach((file, index) => {
    board[`${file}1`] = `w${backRank[index]}`;
    board[`${file}2`] = "wP";
    board[`${file}7`] = "bP";
    board[`${file}8`] = `b${backRank[index]}`;
  });

  return board;
}

function clonePosition(position) {
  return { ...position };
}

export function applyMove(position, move) {
  if (!move) return position;
  const piece = position[move.from];
  if (!piece) return position;

  delete position[move.from];
  position[move.to] = move.promotion ? `${piece[0]}${move.promotion}` : piece;

  if (piece === "wK" && move.from === "e1" && move.to === "g1" && position.h1) {
    position.f1 = position.h1;
    delete position.h1;
  }
  if (piece === "wK" && move.from === "e1" && move.to === "c1" && position.a1) {
    position.d1 = position.a1;
    delete position.a1;
  }
  if (piece === "bK" && move.from === "e8" && move.to === "g8" && position.h8) {
    position.f8 = position.h8;
    delete position.h8;
  }
  if (piece === "bK" && move.from === "e8" && move.to === "c8" && position.a8) {
    position.d8 = position.a8;
    delete position.a8;
  }

  if (move.enPassantCapture) delete position[move.enPassantCapture];
  return position;
}

export function positionAt(moves, ply) {
  const position = createStartingPosition();
  moves.slice(0, Math.max(0, ply)).forEach((move) => applyMove(position, move));
  return position;
}

function squareColor(square) {
  const fileIndex = FILES.indexOf(square[0]);
  const rankIndex = Number(square[1]) - 1;
  return (fileIndex + rankIndex) % 2 === 0 ? "dark" : "light";
}

function ariaForSquare(square, piece) {
  if (!piece) return `${square}, empty`;
  const color = piece[0] === "w" ? "White" : "Black";
  return `${color} ${PIECE_NAMES[piece[1]]} on ${square}`;
}

export class Chessboard {
  constructor(element, options = {}) {
    this.element = element;
    this.orientation = options.orientation || "white";
    this.position = clonePosition(options.position || createStartingPosition());
    this.selected = null;
    this.legalTargets = [];
    this.lastMove = null;
    this.expectedSquares = [];
    this.keySquares = [];
    this.squareElements = new Map();
    this.renderedOrientation = null;
    this.focusedSquare = options.focusedSquare || (this.orientation === "white" ? "e2" : "e7");
    this.interactive = options.interactive ?? false;
    this.onMoveAttempt = options.onMoveAttempt || null;
    this.onSelection = options.onSelection || null;
    this.render();
  }

  setPosition(position, lastMove = null) {
    this.position = clonePosition(position);
    this.lastMove = lastMove;
    this.selected = null;
    this.legalTargets = [];
    this.render();
  }

  reset() {
    this.setPosition(createStartingPosition());
  }

  goToPly(moves, ply) {
    const lastMove = ply > 0 ? moves[ply - 1] : null;
    this.expectedSquares = [];
    this.setPosition(positionAt(moves, ply), lastMove);
  }

  move(move) {
    const next = clonePosition(this.position);
    applyMove(next, move);
    this.setPosition(next, move);
  }

  flip() {
    this.orientation = this.orientation === "white" ? "black" : "white";
    this.renderedOrientation = null;
    this.render();
    return this.orientation;
  }

  setInteractive(value) {
    this.interactive = Boolean(value);
    this.selected = null;
    this.legalTargets = [];
    this.render();
  }

  setExpectedSquares(squares = []) {
    this.expectedSquares = squares.filter(Boolean);
    this.render();
  }

  setKeySquares(squares = []) {
    this.keySquares = squares.filter(Boolean);
    this.render();
  }

  clearHighlights() {
    this.selected = null;
    this.legalTargets = [];
    this.expectedSquares = [];
    this.keySquares = [];
    this.render();
  }

  selectSquare(square) {
    if (!this.interactive) return;
    this.focusedSquare = square;
    const piece = this.position[square];

    if (this.selected === square) {
      this.selected = null;
      this.legalTargets = [];
      this.render();
      return;
    }

    if (this.selected && !piece) {
      const from = this.selected;
      this.selected = null;
      this.legalTargets = [];
      this.render();
      this.onMoveAttempt?.({ from, to: square });
      return;
    }

    if (this.selected && piece) {
      const fromPiece = this.position[this.selected];
      if (fromPiece?.[0] !== piece[0]) {
        const from = this.selected;
        this.selected = null;
        this.legalTargets = [];
        this.render();
        this.onMoveAttempt?.({ from, to: square });
        return;
      }
    }

    if (piece) {
      this.selected = square;
      this.legalTargets = this.onSelection?.(square, piece) || [];
      this.render();
    }
  }

  render() {
    if (!this.element) return;
    const hadBoardFocus = this.element.contains(document.activeElement);
    this.element.classList.toggle("is-interactive", this.interactive);

    const files = this.orientation === "white" ? FILES : [...FILES].reverse();
    const ranks = this.orientation === "white" ? [...RANKS].reverse() : RANKS;
    if (!files.includes(this.focusedSquare?.[0]) || !ranks.includes(this.focusedSquare?.[1])) {
      this.focusedSquare = this.orientation === "white" ? "e2" : "e7";
    }
    this.element.setAttribute(
      "aria-label",
      `Chessboard, ${this.orientation} side at bottom${this.interactive ? "; use arrow keys to move between squares" : ""}`,
    );

    if (this.renderedOrientation !== this.orientation || this.squareElements.size !== 64) {
      this.buildBoard(files, ranks);
    }

    ranks.forEach((rank) => {
      files.forEach((file) => {
        const square = `${file}${rank}`;
        const piece = this.position[square];
        const button = this.squareElements.get(square);
        if (!button) return;
        const classes = ["square", squareColor(square)];
        if (piece) classes.push("has-piece");
        if (this.selected === square) classes.push("selected");
        if (this.legalTargets.includes(square)) classes.push("legal");
        if (this.expectedSquares.includes(square)) classes.push("expected");
        if (this.keySquares.includes(square)) classes.push("key-square");
        if (this.lastMove?.from === square || this.lastMove?.to === square) classes.push("last-move");
        if (this.lastMove?.to === square) classes.push("moved");

        button.type = "button";
        button.tabIndex = this.interactive && square === this.focusedSquare ? 0 : -1;
        button.className = classes.join(" ");
        button.setAttribute("aria-label", ariaForSquare(square, piece));
        if (this.interactive) button.setAttribute("aria-pressed", this.selected === square ? "true" : "false");
        else button.removeAttribute("aria-pressed");

        if ((button.dataset.piece || "") !== (piece || "")) {
          button.querySelector(".piece")?.remove();
          button.dataset.piece = piece || "";
        }

        if (piece && !button.querySelector(".piece")) {
          const pieceElement = document.createElement("span");
          pieceElement.className = `piece ${piece[0] === "w" ? "white-piece" : "black-piece"}`;
          pieceElement.innerHTML = PIECE_SVGS[piece[1]];
          pieceElement.setAttribute("aria-hidden", "true");
          button.prepend(pieceElement);
        }
      });
    });

    if (hadBoardFocus) {
      this.squareElements.get(this.focusedSquare)?.focus({ preventScroll: true });
    }
  }

  buildBoard(files, ranks) {
    const fragment = document.createDocumentFragment();
    this.squareElements.clear();

    ranks.forEach((rank, rowIndex) => {
      files.forEach((file, colIndex) => {
        const square = `${file}${rank}`;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.square = square;
        button.addEventListener("focus", () => {
          this.focusedSquare = button.dataset.square;
        });
        button.addEventListener("click", () => {
          this.focusedSquare = button.dataset.square;
          this.selectSquare(button.dataset.square);
        });
        button.addEventListener("keydown", (event) => this.handleSquareKeydown(event, button.dataset.square));

        if (colIndex === 0) {
          const rankLabel = document.createElement("span");
          rankLabel.className = "coord rank";
          rankLabel.textContent = rank;
          rankLabel.setAttribute("aria-hidden", "true");
          button.appendChild(rankLabel);
        }

        if (rowIndex === 7) {
          const fileLabel = document.createElement("span");
          fileLabel.className = "coord file";
          fileLabel.textContent = file;
          fileLabel.setAttribute("aria-hidden", "true");
          button.appendChild(fileLabel);
        }

        this.squareElements.set(square, button);
        fragment.appendChild(button);
      });
    });
    this.element.replaceChildren(fragment);
    this.renderedOrientation = this.orientation;
  }

  handleSquareKeydown(event, square) {
    if (!this.interactive || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const files = this.orientation === "white" ? FILES : [...FILES].reverse();
    const ranks = this.orientation === "white" ? [...RANKS].reverse() : RANKS;
    let row = ranks.indexOf(square[1]);
    let column = files.indexOf(square[0]);

    if (event.key === "ArrowUp") row = Math.max(0, row - 1);
    if (event.key === "ArrowDown") row = Math.min(ranks.length - 1, row + 1);
    if (event.key === "ArrowLeft") column = Math.max(0, column - 1);
    if (event.key === "ArrowRight") column = Math.min(files.length - 1, column + 1);
    if (event.key === "Home") column = 0;
    if (event.key === "End") column = files.length - 1;

    const nextSquare = `${files[column]}${ranks[row]}`;
    if (nextSquare === square) return;
    this.focusedSquare = nextSquare;
    this.squareElements.forEach((item) => {
      item.tabIndex = item.dataset.square === nextSquare ? 0 : -1;
    });
    this.squareElements.get(nextSquare)?.focus({ preventScroll: true });
  }
}

export function sideToMove(ply) {
  return ply % 2 === 0 ? "White" : "Black";
}
