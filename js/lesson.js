import { Chessboard, sideToMove } from "./board.js";
import { getLine } from "./openings/index.js";
import { decorativePiece } from "./pieces.js";

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanSan(value = "") {
  return String(value).replace(/^\d+\.{1,3}\s*/, "");
}

function formatLine(moves) {
  return moves
    .map((move, index) => `${index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ""}${cleanSan(move.san)}`)
    .join(" ");
}

function moveThemes(move) {
  if (!move) return [];
  const text = `${move.san} ${move.explanation}`.toLowerCase();
  const themes = [];
  const add = (label) => {
    if (!themes.includes(label) && themes.length < 3) themes.push(label);
  };

  if (/develop|mobiliz/.test(text) || /^[NB]/.test(cleanSan(move.san))) add("Development");
  if (/cent(?:er|ral)|\b[de][45]\b/.test(text)) add("Center");
  if (/castle|king safety|shelter/.test(text)) add("King safety");
  if (/counterplay|counterattack/.test(text)) add("Counterplay");
  if (/pawn break|\bbreak\b|challenge/.test(text)) add("Pawn break");
  if (/attack|pressure|target|threat/.test(text)) add("Pressure");
  if (/space|territory/.test(text)) add("Space");
  if (/exchange|trade|simplif/.test(text)) add("Exchange");
  if (/file|diagonal|open line|coordina/.test(text)) add("Piece activity");
  if (!themes.length) add("Coordination");
  return themes;
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    return copied;
  }
}

function lineOptions(opening, selected) {
  const items = [
    { value: "main", label: `Main · ${opening.mainLine.name}` },
    ...opening.variations.map((variation, index) => ({
      value: variation.id || String(index),
      label: `Variation · ${variation.name}`,
    })),
  ];

  return items
    .map(
      (item) =>
        `<option value="${item.value}" ${item.value === selected ? "selected" : ""}>${escapeHTML(item.label)}</option>`,
    )
    .join("");
}

function notationRows(moves, ply) {
  const rows = [];
  for (let index = 0; index < moves.length; index += 2) {
    const white = moves[index];
    const black = moves[index + 1];
    const number = Math.floor(index / 2) + 1;
    rows.push(`<span class="notation-number">${number}.</span>`);
    [white, black].forEach((move, offset) => {
      if (!move) {
        rows.push("<span></span>");
        return;
      }
      const moveIndex = index + offset;
      const classes = ["notation-move"];
      if (moveIndex === ply - 1) classes.push("active");
      if (moveIndex >= ply) classes.push("future");
      rows.push(
        `<button class="${classes.join(" ")}" type="button" data-jump-ply="${moveIndex + 1}" aria-label="Go to ${escapeHTML(move.san)}">${escapeHTML(move.san.replace(/^\d+\.{1,3}\s*/, ""))}</button>`,
      );
    });
  }
  return rows.join("");
}

export class LessonController {
  constructor({ opening, root, store, onProgressChange, onNavigatePractice, onToast }) {
    this.opening = opening;
    this.root = root;
    this.store = store;
    this.onProgressChange = onProgressChange;
    this.onNavigatePractice = onNavigatePractice;
    this.onToast = onToast;
    this.activeTab = "overview";
    this.lineKey = "main";
    this.ply = 0;
    this.playTimer = null;
    this.hintTimer = null;
    this.noteTimer = null;
    this.pendingNote = null;
    this.highlightedKeySquare = null;
    this.board = new Chessboard(root.querySelector("#lesson-board"), {
      orientation: opening.side.toLowerCase(),
      interactive: false,
    });
    this.bindPersistentControls();
    this.renderPanel();
    this.updateBoardMeta();
  }

  get line() {
    return getLine(this.opening, this.lineKey);
  }

  bindPersistentControls() {
    this.root.querySelector("#flip-board")?.addEventListener("click", () => {
      this.board.flip();
      this.root.querySelector("#flip-board")?.setAttribute(
        "aria-label",
        `Flip board; ${this.board.orientation} is currently at the bottom`,
      );
    });

    this.root.querySelector("#reset-board")?.addEventListener("click", () => {
      this.stopPlayback();
      this.goToPly(0);
    });

    this.root.querySelector("#next-hint")?.addEventListener("click", () => {
      const next = this.line.moves[this.ply];
      if (!next) {
        this.onToast?.("You have reached the end of this line.");
        return;
      }
      window.clearTimeout(this.hintTimer);
      this.board.setExpectedSquares([next.from, next.to]);
      this.onToast?.(`Next idea: ${next.san} — ${next.explanation}`);
      this.hintTimer = window.setTimeout(() => {
        this.board.setExpectedSquares([]);
        this.hintTimer = null;
      }, 1800);
    });

    this.keyboardHandler = (event) => {
      const tag = event.target?.tagName?.toLowerCase();
      if (["input", "select", "textarea", "button", "a"].includes(tag) || this.activeTab !== "moves") return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.handlePlayback("previous");
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        this.handlePlayback("next");
      }
      if (event.key === " ") {
        event.preventDefault();
        this.handlePlayback("play");
      }
    };
    document.addEventListener("keydown", this.keyboardHandler);
  }

  renderPanel() {
    const panel = this.root.querySelector("#lesson-panel-content");
    if (!panel) return;

    this.root.querySelectorAll("[data-lesson-tab]").forEach((button) => {
      const active = button.dataset.lessonTab === this.activeTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.setAttribute("tabindex", active ? "0" : "-1");
    });

    panel.setAttribute("aria-labelledby", `lesson-tab-${this.activeTab}`);
    panel.dataset.context = this.activeTab;

    this.board.setKeySquares([]);
    this.highlightedKeySquare = null;

    if (this.activeTab === "overview") panel.innerHTML = this.overviewMarkup();
    if (this.activeTab === "moves") panel.innerHTML = this.movesMarkup();
    if (this.activeTab === "ideas") panel.innerHTML = this.ideasMarkup();
    if (this.activeTab === "practice") panel.innerHTML = this.practiceMarkup();

    this.bindPanelControls();
  }

  overviewMarkup() {
    return `
      <div class="page-enter">
        <p class="eyebrow">Opening overview</p>
        <h2>What this opening is trying to do</h2>
        <p class="panel-lead">${escapeHTML(this.opening.intro)}</p>
        <div class="info-grid">
          <div class="info-card"><span>Character</span><strong>${escapeHTML(this.opening.character)}</strong></div>
          <div class="info-card"><span>Best for</span><strong>${escapeHTML(this.opening.skillLevel)}</strong></div>
          <div class="info-card"><span>You learn as</span><strong>${escapeHTML(this.opening.side)}</strong></div>
          <div class="info-card"><span>Core sequence</span><strong>${escapeHTML(this.opening.startingMoves)}</strong></div>
        </div>
        <p class="section-label">Main objectives</p>
        <ul class="objective-list">
          ${this.opening.objectives.map((idea) => `<li>${escapeHTML(idea)}</li>`).join("")}
        </ul>
        <p class="section-label">Memory tip</p>
        <div class="memory-tip">${escapeHTML(this.opening.memoryTip)}</div>
        <div class="context-actions">
          <button class="button" type="button" data-open-tab="moves">Start guided moves <span aria-hidden="true">→</span></button>
          <button class="button button-ghost" type="button" data-open-tab="ideas">Study key ideas</button>
        </div>
      </div>`;
  }

  movesMarkup() {
    const moves = this.line.moves;
    const currentMove = this.ply > 0 ? moves[this.ply - 1] : null;
    const progress = moves.length ? Math.round((this.ply / moves.length) * 100) : 0;
    const themes = moveThemes(currentMove);

    return `
      <div class="page-enter">
        <div class="line-selector">
          <label for="lesson-line">Instructional line</label>
          <div class="line-selector-controls">
            <select class="line-select" id="lesson-line">${lineOptions(this.opening, this.lineKey)}</select>
            <button class="mini-action" type="button" data-copy-line aria-label="Copy ${escapeHTML(this.line.name)} notation">Copy line</button>
            <a class="mini-action" href="#opening/${this.opening.id}/practice/${this.lineKey}/guided">Practice</a>
          </div>
        </div>
        <div class="move-explanation" aria-live="polite">
          <div class="move-counter">
            <span>${this.ply ? `Ply ${this.ply} of ${moves.length}` : "Start position"}</span>
            <span>${progress}% of line</span>
          </div>
          <div class="move-san">${currentMove ? escapeHTML(currentMove.san) : "Ready to begin"}</div>
          <span class="move-purpose-label">${currentMove ? "Purpose & idea" : "How to study this line"}</span>
          <p>${currentMove ? escapeHTML(currentMove.explanation) : `Follow ${escapeHTML(this.line.name)} one move at a time. Each move updates the board and explains its purpose.`}</p>
          ${themes.length ? `<div class="move-themes" aria-label="Move themes">${themes.map((theme) => `<span>${theme}</span>`).join("")}</div>` : ""}
        </div>
        <div class="playback-controls" aria-label="Lesson playback controls">
          <button class="playback-button" type="button" data-playback="start" aria-label="Beginning" ${this.ply === 0 ? "disabled" : ""}><span aria-hidden="true">|‹</span></button>
          <button class="playback-button" type="button" data-playback="previous" aria-label="Previous move" ${this.ply === 0 ? "disabled" : ""}><span aria-hidden="true">‹</span><span class="playback-direction-label">Previous</span></button>
          <button class="playback-button primary" type="button" data-playback="play" ${this.ply === moves.length ? "disabled" : ""} aria-label="${this.playTimer ? "Pause" : "Play"} lesson">
            <span aria-hidden="true">${this.playTimer ? "Ⅱ" : "▶"}</span> ${this.playTimer ? "Pause" : "Play line"}
          </button>
          <button class="playback-button" type="button" data-playback="next" aria-label="Next move" ${this.ply === moves.length ? "disabled" : ""}><span class="playback-direction-label">Next</span><span aria-hidden="true">›</span></button>
          <button class="playback-button" type="button" data-playback="end" aria-label="End" ${this.ply === moves.length ? "disabled" : ""}><span aria-hidden="true">›|</span></button>
        </div>
        <div class="notation-wrap">
          <div class="notation-title">Move notation · click a move or use ← → · Space plays</div>
          <div class="notation-list">${notationRows(moves, this.ply)}</div>
        </div>
      </div>`;
  }

  ideasMarkup() {
    const note = this.store.get(this.opening.id).note || "";
    return `
      <div class="page-enter">
        <p class="eyebrow">Strategic map</p>
        <h2>Plans, squares, and patterns</h2>
        <p class="panel-lead">Learn what both sides want before memorizing more moves. Click a key square to locate it on the board.</p>
        <div class="ideas-columns">
          <section class="plan-block">
            <h3>Plans for White</h3>
            <ul class="plan-list">${this.opening.plans.white.map((plan) => `<li>${escapeHTML(plan)}</li>`).join("")}</ul>
          </section>
          <section class="plan-block">
            <h3>Plans for Black</h3>
            <ul class="plan-list">${this.opening.plans.black.map((plan) => `<li>${escapeHTML(plan)}</li>`).join("")}</ul>
          </section>
        </div>
        <p class="section-label">Key squares</p>
        <div class="key-squares">
          ${this.opening.keySquares
            .map(
              (item) => `<button class="key-square-button" type="button" data-key-square="${item.square}" data-key-label="${escapeHTML(item.label)}">
                <span class="square-code">${item.square}</span><span>${escapeHTML(item.label)}</span>
              </button>`,
            )
            .join("")}
        </div>
        <p class="section-label">Characteristic pawn structure</p>
        <div class="structure-card"><strong>Structural fingerprint</strong><p>${escapeHTML(this.opening.pawnStructure)}</p></div>
        <p class="section-label">Common mistakes</p>
        <ul class="mistake-list">${this.opening.mistakes.map((mistake) => `<li>${escapeHTML(mistake)}</li>`).join("")}</ul>
        <div class="memory-tip">${escapeHTML(this.opening.memoryTip)}</div>
        <label class="study-note" for="opening-study-note">
          <span class="study-note-heading"><strong>Your private note</strong><small id="study-note-status" role="status">Saved only on this device</small></span>
          <textarea id="opening-study-note" maxlength="2000" rows="4" placeholder="Write a personal cue, position reminder, or question…">${escapeHTML(note)}</textarea>
        </label>
      </div>`;
  }

  practiceMarkup() {
    const progress = this.store.get(this.opening.id);
    const lessonStep = progress.lessonComplete
      ? '<span class="done" title="Learn">✓</span>'
      : '<span class="current" title="Learn">1</span>';
    const practiceStep = `<span class="${progress.lessonComplete ? "current" : ""}" title="Practice">2</span>`;
    return `
      <div class="practice-preview page-enter">
        <div class="practice-preview-icon" aria-hidden="true">${decorativePiece("♟")}</div>
        <p class="eyebrow centered">Your turn</p>
        <h2>Reproduce the ${escapeHTML(this.opening.name)}</h2>
        <p class="panel-lead">Play the ${escapeHTML(this.opening.side)} moves from the starting position. Your training partner answers automatically, while hints become more specific only when you need them.</p>
        <div class="practice-steps" aria-label="Learning path">
          ${lessonStep}${practiceStep}<span title="Quiz">3</span><span title="Master">4</span>
        </div>
        <button class="button" type="button" data-start-practice>${progress.practiceComplete ? "Practice again" : "Start board practice"} <span aria-hidden="true">→</span></button>
        ${progress.practiceComplete ? '<p class="completion-note">Practice completed on this device.</p>' : ""}
      </div>`;
  }

  bindPanelControls() {
    this.root.querySelectorAll("[data-open-tab]").forEach((button) => {
      button.addEventListener("click", () => this.setTab(button.dataset.openTab));
    });

    this.root.querySelector("#lesson-line")?.addEventListener("change", (event) => {
      this.stopPlayback();
      this.lineKey = event.target.value;
      this.ply = 0;
      this.board.goToPly(this.line.moves, 0);
      this.renderPanel();
      this.updateBoardMeta();
    });

    this.root.querySelectorAll("[data-playback]").forEach((button) => {
      button.addEventListener("click", () => this.handlePlayback(button.dataset.playback));
    });

    this.root.querySelector("[data-copy-line]")?.addEventListener("click", async () => {
      const copied = await copyText(formatLine(this.line.moves));
      this.onToast?.(copied ? `${this.line.name} copied.` : "The line could not be copied in this browser.");
    });

    this.root.querySelectorAll("[data-jump-ply]").forEach((button) => {
      button.addEventListener("click", () => {
        this.stopPlayback();
        this.goToPly(Number(button.dataset.jumpPly));
      });
    });

    this.root.querySelectorAll("[data-key-square]").forEach((button) => {
      button.addEventListener("click", () => {
        const square = button.dataset.keySquare;
        const isActive = this.highlightedKeySquare === square;
        this.highlightedKeySquare = isActive ? null : square;
        this.board.setKeySquares(this.highlightedKeySquare ? [this.highlightedKeySquare] : []);
        this.root.querySelectorAll("[data-key-square]").forEach((item) => {
          item.classList.toggle("active", item.dataset.keySquare === this.highlightedKeySquare);
        });
        if (!isActive) this.onToast?.(`${square}: ${button.dataset.keyLabel}`);
      });
    });

    this.root.querySelector("[data-start-practice]")?.addEventListener("click", () => {
      this.onNavigatePractice?.(this.opening.id);
    });

    const note = this.root.querySelector("#opening-study-note");
    note?.addEventListener("input", () => {
      this.pendingNote = note.value;
      const status = this.root.querySelector("#study-note-status");
      if (status) status.textContent = "Saving…";
      window.clearTimeout(this.noteTimer);
      this.noteTimer = window.setTimeout(() => this.flushNote(), 320);
    });
  }

  setTab(tab) {
    if (!['overview', 'moves', 'ideas', 'practice'].includes(tab)) return;
    this.flushNote();
    this.stopPlayback();
    this.activeTab = tab;
    this.renderPanel();
  }

  handlePlayback(action) {
    const length = this.line.moves.length;
    if (action === "start") {
      this.stopPlayback();
      this.goToPly(0);
    }
    if (action === "previous") {
      this.stopPlayback();
      this.goToPly(Math.max(0, this.ply - 1));
    }
    if (action === "next") {
      this.stopPlayback();
      this.goToPly(Math.min(length, this.ply + 1));
    }
    if (action === "end") {
      this.stopPlayback();
      this.goToPly(length);
    }
    if (action === "play") {
      if (this.playTimer) this.stopPlayback();
      else this.startPlayback();
      this.renderPanel();
    }
  }

  startPlayback() {
    if (this.ply >= this.line.moves.length) {
      this.ply = 0;
      this.board.goToPly(this.line.moves, 0);
      this.updateBoardMeta();
    }
    this.playTimer = window.setInterval(() => {
      if (this.ply >= this.line.moves.length) {
        this.stopPlayback();
        this.renderPanel();
        return;
      }
      this.goToPly(this.ply + 1);
      if (this.ply >= this.line.moves.length) {
        this.stopPlayback();
        this.renderPanel();
      }
    }, 1250);
  }

  stopPlayback() {
    if (this.playTimer) window.clearInterval(this.playTimer);
    this.playTimer = null;
  }

  flushNote() {
    window.clearTimeout(this.noteTimer);
    this.noteTimer = null;
    if (this.pendingNote === null) return;
    const result = this.store.setNote(this.opening.id, this.pendingNote);
    this.pendingNote = null;
    const status = this.root.querySelector("#study-note-status");
    if (status) status.textContent = result.saved ? "Saved only on this device" : "Saved for this visit only";
  }

  goToPly(nextPly) {
    window.clearTimeout(this.hintTimer);
    this.hintTimer = null;
    this.ply = Math.max(0, Math.min(nextPly, this.line.moves.length));
    this.board.goToPly(this.line.moves, this.ply);
    this.updateBoardMeta();

    if (this.ply === this.line.moves.length && this.lineKey === "main") {
      const before = this.store.get(this.opening.id).lessonComplete;
      this.store.completeLesson(this.opening.id);
      this.onProgressChange?.();
      if (!before) this.onToast?.("Guided lesson complete — practice is now the next step.");
    }

    if (this.activeTab === "moves") this.renderPanel();
  }

  updateBoardMeta() {
    const turn = sideToMove(this.ply);
    const label = this.root.querySelector("#turn-label");
    const dot = this.root.querySelector("#turn-dot");
    if (label) label.textContent = `${turn} to move`;
    if (dot) dot.classList.toggle("black", turn === "Black");

    const currentLabel = this.root.querySelector("#current-move-label");
    if (currentLabel) {
      currentLabel.textContent = this.ply
        ? `${this.line.moves[this.ply - 1].san} · ${this.ply}/${this.line.moves.length}`
        : `Start · 0/${this.line.moves.length}`;
    }
  }

  destroy() {
    this.flushNote();
    window.clearTimeout(this.hintTimer);
    this.stopPlayback();
    document.removeEventListener("keydown", this.keyboardHandler);
  }
}
