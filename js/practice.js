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

function lineOptions(opening, selected) {
  const options = [
    { value: "main", label: `Core line · ${opening.mainLine.name}` },
    ...opening.variations.map((variation, index) => ({
      value: variation.id || String(index),
      label: `Variation · ${variation.name}`,
    })),
  ];
  return options
    .map((option) => `<option value="${option.value}" ${selected === option.value ? "selected" : ""}>${escapeHTML(option.label)}</option>`)
    .join("");
}

function modeOptions(selected) {
  return [
    { value: "guided", label: "Guided · progressive hints" },
    { value: "recall", label: "Recall · no automatic hints" },
    { value: "sprint", label: "Sprint · 60 seconds" },
  ]
    .map((option) => `<option value="${option.value}" ${selected === option.value ? "selected" : ""}>${option.label}</option>`)
    .join("");
}

export function practicePageMarkup(opening, progress, options = {}) {
  const selectedLine = getLine(opening, options.lineKey)?.id || "main";
  const selectedMode = ["guided", "recall", "sprint"].includes(options.mode) ? options.mode : "guided";
  const line = getLine(opening, selectedLine);
  return `
    <section class="lesson-shell practice-page page-enter">
      <div class="lesson-breadcrumbs"><a href="#home">Opening library</a><span aria-hidden="true">/</span><a href="#opening/${opening.id}">${escapeHTML(opening.name)}</a><span aria-hidden="true">/</span><span>Practice</span></div>
      <header class="lesson-header">
        <div class="lesson-title-wrap">
          <span class="opening-glyph" aria-hidden="true">${decorativePiece(opening.glyph)}</span>
          <div><p class="eyebrow compact">Interactive practice</p><h1>${escapeHTML(opening.name)}</h1><div class="lesson-meta"><span>Play as ${opening.side}</span><i></i><span>${escapeHTML(line.name)}</span></div></div>
        </div>
        <div class="lesson-status"><span>${progress.practiceComplete ? "Completed · train again" : `${escapeHTML(line.name)} training`}</span><div class="progress-track compact-progress"><span id="practice-header-bar" style="width:0%"></span></div><strong id="practice-header-value">0%</strong></div>
      </header>

      <div class="lesson-layout">
        <div class="board-column">
          <div class="board-frame" id="practice-board-frame"><div class="chessboard" id="practice-board" role="group"></div></div>
          <div class="board-toolbar">
            <span class="turn-indicator"><span class="turn-dot" id="practice-turn-dot"></span><span id="practice-turn-label">White to move</span><span aria-hidden="true">·</span><span id="practice-ply-label">Preparing line</span></span>
            <div class="board-actions">
              <button class="icon-button" id="practice-hint" type="button" aria-label="Get a hint" title="Hint">?</button>
              <button class="icon-button" id="practice-reset" type="button" aria-label="Restart practice" title="Restart">↺</button>
              <button class="icon-button" id="practice-flip" type="button" aria-label="Flip board" title="Flip board">⇅</button>
            </div>
          </div>
        </div>

        <article class="practice-coach-panel">
          <div class="practice-coach-top">
            <div class="practice-select-group"><label for="practice-line">Training line</label><select class="line-select" id="practice-line">${lineOptions(opening, selectedLine)}</select></div>
            <div class="practice-select-group"><label for="practice-mode">Training mode</label><select class="line-select" id="practice-mode">${modeOptions(selectedMode)}</select></div>
          </div>
          <div class="practice-progress-row"><div class="progress-track"><span id="practice-line-bar"></span></div><span id="practice-line-count">0 / 0 moves</span><span class="practice-timer ${selectedMode === "sprint" ? "" : "hidden"}" id="practice-timer" aria-live="polite">1:00</span></div>
          <div id="practice-coach-content" aria-live="polite"></div>
          <div class="practice-footer">
            <a class="button button-ghost" href="#opening/${opening.id}">Review lesson</a>
            <a class="button button-ghost" href="#review">Review queue</a>
            <a class="button" href="#opening/${opening.id}/quiz">Take quiz <span aria-hidden="true">→</span></a>
          </div>
        </article>
      </div>
    </section>`;
}

export class PracticeController {
  constructor({ opening, root, store, onProgressChange, onToast, initialLineKey = "main", initialMode = "guided" }) {
    this.opening = opening;
    this.root = root;
    this.store = store;
    this.onProgressChange = onProgressChange;
    this.onToast = onToast;
    this.lineKey = getLine(opening, initialLineKey)?.id || "main";
    this.mode = ["guided", "recall", "sprint"].includes(initialMode) ? initialMode : "guided";
    this.ply = 0;
    this.mistakes = 0;
    this.totalMistakes = 0;
    this.hintLevel = 0;
    this.hintsUsed = 0;
    this.correctUserMoves = 0;
    this.lastAcceptedMove = null;
    this.status = "ready";
    this.pendingTimer = null;
    this.countdownTimer = null;
    this.timeRemaining = 60;
    this.lastReview = null;
    this.board = new Chessboard(root.querySelector("#practice-board"), {
      orientation: opening.side.toLowerCase(),
      interactive: true,
      onSelection: (square) => this.selectionTargets(square),
      onMoveAttempt: (attempt) => this.handleAttempt(attempt),
    });
    this.bindControls();
    this.start();
  }

  get line() {
    return getLine(this.opening, this.lineKey);
  }

  get learnerColor() {
    return this.opening.side === "White" ? "w" : "b";
  }

  get expectedMove() {
    return this.line.moves[this.ply] || null;
  }

  get learnerMoveTotal() {
    return this.line.moves.filter((_, index) => (index % 2 === 0 ? "w" : "b") === this.learnerColor).length;
  }

  selectionTargets(square) {
    if (this.status !== "your-turn") return [];
    if (this.mode !== "guided") return [];
    return this.expectedMove?.from === square ? [this.expectedMove.to] : [];
  }

  bindControls() {
    this.root.querySelector("#practice-flip")?.addEventListener("click", () => this.board.flip());
    this.root.querySelector("#practice-reset")?.addEventListener("click", () => {
      this.recordInterruptedReview();
      this.start();
    });
    this.root.querySelector("#practice-hint")?.addEventListener("click", () => this.revealHint());
    this.root.querySelector("#practice-line")?.addEventListener("change", (event) => {
      this.recordInterruptedReview();
      this.lineKey = event.target.value;
      this.updateRouteState();
      this.start();
    });
    this.root.querySelector("#practice-mode")?.addEventListener("change", (event) => {
      this.recordInterruptedReview();
      this.mode = event.target.value;
      this.updateRouteState();
      this.start();
    });
  }

  start() {
    window.clearTimeout(this.pendingTimer);
    window.clearInterval(this.countdownTimer);
    this.ply = 0;
    this.mistakes = 0;
    this.totalMistakes = 0;
    this.hintLevel = 0;
    this.hintsUsed = 0;
    this.correctUserMoves = 0;
    this.lastAcceptedMove = null;
    this.timeRemaining = 60;
    this.lastReview = null;
    this.status = "ready";
    this.board.orientation = this.opening.side.toLowerCase();
    this.board.reset();
    this.board.setInteractive(true);
    this.board.setExpectedSquares([]);
    this.updateMeta();
    this.renderCoach("ready");
    this.updateTimer();
    if (this.mode === "sprint") this.startCountdown();

    if (this.expectedMove && this.colorForPly(this.ply) !== this.learnerColor) {
      this.board.setInteractive(false);
      this.status = "opponent";
      this.renderCoach("opponent");
      this.pendingTimer = window.setTimeout(() => this.playOpponentMove(), this.opponentDelay());
    } else {
      this.status = "your-turn";
      this.renderCoach("your-turn");
    }
  }

  colorForPly(ply) {
    return ply % 2 === 0 ? "w" : "b";
  }

  opponentDelay() {
    if (this.mode === "sprint") return 220;
    if (this.mode === "recall") return 520;
    return 760;
  }

  updateRouteState() {
    const hash = `#opening/${this.opening.id}/practice/${this.lineKey}/${this.mode}`;
    history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
  }

  startCountdown() {
    this.countdownTimer = window.setInterval(() => {
      this.timeRemaining -= 1;
      this.updateTimer();
      if (this.timeRemaining <= 0) this.timeout();
    }, 1000);
  }

  updateTimer() {
    const timer = this.root.querySelector("#practice-timer");
    if (!timer) return;
    timer.classList.toggle("hidden", this.mode !== "sprint");
    const remaining = Math.max(0, this.timeRemaining);
    timer.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
    timer.classList.toggle("urgent", this.mode === "sprint" && this.timeRemaining <= 10);
  }

  recordInterruptedReview() {
    if (["complete", "timeout"].includes(this.status) || (!this.correctUserMoves && !this.totalMistakes)) return;
    this.store.recordLineReview(this.opening.id, this.lineKey, {
      completed: false,
      mistakes: this.totalMistakes,
      hints: this.hintsUsed,
      totalMoves: this.learnerMoveTotal,
    });
    this.store.recordPracticeAttempt(this.opening.id);
    this.onProgressChange?.();
  }

  handleAttempt(attempt) {
    if (this.status !== "your-turn" || !this.expectedMove) return;
    const correct = attempt.from === this.expectedMove.from && attempt.to === this.expectedMove.to;
    if (correct) this.acceptUserMove();
    else this.rejectUserMove();
  }

  acceptUserMove() {
    const move = this.expectedMove;
    this.board.setExpectedSquares([]);
    this.board.move(move);
    this.ply += 1;
    this.correctUserMoves += 1;
    this.lastAcceptedMove = move;
    this.mistakes = 0;
    this.hintLevel = 0;
    this.status = "correct";
    this.updateMeta();
    this.renderCoach("correct", move);

    if (this.ply >= this.line.moves.length) {
      if (this.mode === "sprint") this.finish();
      else this.pendingTimer = window.setTimeout(() => this.finish(), 620);
      return;
    }

    this.board.setInteractive(false);
    this.pendingTimer = window.setTimeout(() => this.playOpponentMove(), this.opponentDelay());
  }

  playOpponentMove() {
    if (this.ply >= this.line.moves.length) {
      this.finish();
      return;
    }

    const move = this.expectedMove;
    if (this.colorForPly(this.ply) === this.learnerColor) {
      this.status = "your-turn";
      this.board.setInteractive(true);
      this.renderCoach("your-turn");
      this.updateMeta();
      return;
    }

    this.status = "opponent";
    this.renderCoach("opponent", move);
    this.board.move(move);
    this.ply += 1;
    this.updateMeta();

    if (this.ply >= this.line.moves.length) {
      if (this.mode === "sprint") this.finish();
      else this.pendingTimer = window.setTimeout(() => this.finish(), 560);
    } else {
      this.status = "your-turn";
      this.board.setInteractive(true);
      this.renderCoach("your-turn");
    }
  }

  rejectUserMove() {
    this.mistakes += 1;
    this.totalMistakes += 1;
    const frame = this.root.querySelector("#practice-board-frame");
    frame?.classList.remove("shake");
    void frame?.offsetWidth;
    frame?.classList.add("shake");
    window.setTimeout(() => frame?.classList.remove("shake"), 350);

    if (this.mode !== "guided") {
      this.board.setExpectedSquares([]);
      this.renderCoach("recall-wrong");
    } else if (this.mistakes === 1) {
      this.hintLevel = Math.max(this.hintLevel, 1);
      this.board.setExpectedSquares([]);
      this.renderCoach("wrong-1");
    } else if (this.mistakes === 2) {
      this.hintLevel = Math.max(this.hintLevel, 2);
      this.board.setExpectedSquares([this.expectedMove.from]);
      this.renderCoach("wrong-2");
    } else {
      this.hintLevel = 3;
      this.board.setExpectedSquares([this.expectedMove.from, this.expectedMove.to]);
      this.renderCoach("wrong-3");
    }
  }

  revealHint() {
    if (this.status !== "your-turn" || !this.expectedMove) {
      this.onToast?.("A hint will be available when it is your turn.");
      return;
    }
    if (this.hintLevel < 3) this.hintsUsed += 1;
    this.hintLevel = Math.min(3, this.hintLevel + 1);
    if (this.hintLevel === 1) {
      this.renderCoach("wrong-1");
    } else if (this.hintLevel === 2) {
      this.board.setExpectedSquares([this.expectedMove.from]);
      this.renderCoach("wrong-2");
    } else {
      this.board.setExpectedSquares([this.expectedMove.from, this.expectedMove.to]);
      this.renderCoach("wrong-3");
    }
  }

  finish() {
    if (this.status === "complete") return;
    window.clearTimeout(this.pendingTimer);
    window.clearInterval(this.countdownTimer);
    this.status = "complete";
    this.board.setInteractive(false);
    this.board.setExpectedSquares([]);
    this.lastReview = this.store.recordLineReview(this.opening.id, this.lineKey, {
      completed: true,
      mistakes: this.totalMistakes,
      hints: this.hintsUsed,
      totalMoves: this.learnerMoveTotal,
    });
    if (this.lineKey === "main") {
      this.store.completePractice(this.opening.id);
      this.onProgressChange?.();
    } else {
      this.store.recordPracticeAttempt(this.opening.id);
      this.onProgressChange?.();
    }
    this.updateMeta();
    this.renderCoach("complete");
    this.onToast?.(`${this.line.name} complete — the moves are becoming a pattern.`);
  }

  timeout() {
    if (this.status === "complete" || this.status === "timeout") return;
    window.clearTimeout(this.pendingTimer);
    window.clearInterval(this.countdownTimer);
    this.status = "timeout";
    this.board.setInteractive(false);
    this.board.setExpectedSquares([]);
    this.store.recordLineReview(this.opening.id, this.lineKey, {
      completed: false,
      mistakes: this.totalMistakes,
      hints: this.hintsUsed,
      totalMoves: this.learnerMoveTotal,
    });
    this.store.recordPracticeAttempt(this.opening.id);
    this.onProgressChange?.();
    this.updateMeta();
    this.renderCoach("timeout");
    this.onToast?.("Sprint complete — accuracy first, speed second.");
  }

  updateMeta() {
    const percent = this.line.moves.length ? Math.round((this.ply / this.line.moves.length) * 100) : 0;
    const turn = sideToMove(this.ply);
    const turnLabel = this.root.querySelector("#practice-turn-label");
    const turnDot = this.root.querySelector("#practice-turn-dot");
    const plyLabel = this.root.querySelector("#practice-ply-label");
    if (turnLabel) turnLabel.textContent = this.status === "complete" ? "Line complete" : this.status === "timeout" ? "Sprint complete" : `${turn} to move`;
    if (turnDot) turnDot.classList.toggle("black", turn === "Black");
    if (plyLabel) plyLabel.textContent = `${this.ply}/${this.line.moves.length} plies`;
    ["#practice-line-bar", "#practice-header-bar"].forEach((selector) => {
      const bar = this.root.querySelector(selector);
      if (bar) bar.style.width = `${percent}%`;
    });
    const headerValue = this.root.querySelector("#practice-header-value");
    if (headerValue) headerValue.textContent = `${percent}%`;
    const count = this.root.querySelector("#practice-line-count");
    if (count) count.textContent = `${this.correctUserMoves} / ${this.learnerMoveTotal} moves`;
  }

  renderCoach(type, move = null) {
    const container = this.root.querySelector("#practice-coach-content");
    if (!container) return;
    const expected = this.expectedMove;
    const step = Math.min(this.correctUserMoves + 1, this.learnerMoveTotal);
    const modeLabel = { guided: "Guided", recall: "Recall", sprint: "60-second Sprint" }[this.mode];
    const commonTop = `<div class="coach-step"><span>Step ${step} of ${this.learnerMoveTotal}</span><span>${modeLabel} · ${this.opening.side}</span></div>`;
    let body = "";

    if (type === "ready") {
      body = `<div class="coach-state-icon neutral" aria-hidden="true">${decorativePiece("♟")}</div><h2>Set up your board vision.</h2><p>The line begins from the standard position. Select a piece, then its destination square.</p>`;
    }
    if (type === "opponent") {
      body = `<div class="coach-state-icon neutral thinking" aria-hidden="true">···</div><h2>Your training partner is moving.</h2><p>Watch the reply, then continue the ${escapeHTML(this.opening.name)} as ${this.opening.side}.</p>`;
    }
    if (type === "your-turn") {
      const positiveFeedback = this.lastAcceptedMove
        ? `<div class="coach-feedback-strip" role="status"><span aria-hidden="true">✓</span><div><strong>${escapeHTML(this.lastAcceptedMove.san)} was right.</strong><small>${escapeHTML(this.lastAcceptedMove.explanation)}</small></div></div>`
        : "";
      body = `${positiveFeedback}<div class="coach-state-icon neutral" aria-hidden="true">${decorativePiece(this.opening.side === "White" ? "♙" : "♟")}</div><h2>Play ${this.opening.side}’s move.</h2><p>${this.mode === "guided" && this.mistakes ? "Use the board highlight, then recall why the move belongs." : `Continue the ${escapeHTML(this.line.name)} from memory.`}</p><div class="coach-tip"><strong>${this.mode === "guided" ? "Position cue" : "Memory rule"}</strong><span>${this.mode === "guided" ? (this.ply === 0 ? "Claim or challenge the center with the opening’s defining move." : "Ask which developing move or pawn break advances the opening’s plan.") : "No square is revealed automatically. Use Hint only when retrieval has genuinely stalled."}</span></div>`;
    }
    if (type === "correct") {
      body = `<div class="coach-state-icon correct" aria-hidden="true">✓</div><h2>Excellent — ${escapeHTML(move.san)}.</h2><p>${escapeHTML(move.explanation)}</p><div class="coach-tip correct-tip"><strong>Pattern stored</strong><span>Connect the move to its purpose, not only its destination.</span></div>`;
    }
    if (type === "wrong-1") {
      body = `<div class="coach-state-icon wrong" aria-hidden="true">×</div><h2>Not quite. Re-read the position.</h2><p>Look for a move that advances the opening’s central idea while developing or challenging space.</p><div class="coach-tip"><strong>Hint 1</strong><span>The solution is part of the line you just studied; no move has been revealed yet.</span></div>`;
    }
    if (type === "recall-wrong") {
      body = `<div class="coach-state-icon wrong" aria-hidden="true">×</div><h2>That move is outside this repertoire.</h2><p>Nothing has been revealed. Reconstruct the position’s central demand and try again, or request a deliberate hint.</p><div class="coach-tip"><strong>Recall stays active</strong><span>Repeated attempts do not expose the answer automatically.</span></div>`;
    }
    if (type === "wrong-2") {
      body = `<div class="coach-state-icon hint" aria-hidden="true">?</div><h2>Start with the highlighted piece.</h2><p>The correct piece is now marked on the board. Find the square that gives it the right job.</p><div class="coach-tip"><strong>Hint 2</strong><span>Selected piece: ${escapeHTML(expected?.from || "")}</span></div>`;
    }
    if (type === "wrong-3") {
      body = `<div class="coach-state-icon hint" aria-hidden="true">→</div><h2>Follow the highlighted route.</h2><p>The origin and destination are marked. Play the move yourself to reinforce the pattern.</p><div class="coach-tip"><strong>Hint 3</strong><span>${escapeHTML(expected?.from || "")} → ${escapeHTML(expected?.to || "")}</span></div>`;
    }
    if (type === "complete") {
      const main = this.lineKey === "main";
      const reviewDays = this.lastReview?.intervalDays || 1;
      const nextReview = reviewDays < 1 ? "later today" : reviewDays === 1 ? "tomorrow" : `in ${reviewDays} days`;
      body = `<div class="coach-state-icon correct complete" aria-hidden="true">✓</div><p class="eyebrow centered">Line complete</p><h2>You reproduced ${escapeHTML(this.line.name)}.</h2><p>${main ? "Practice is complete. An 80% quiz score will complete the mastery path." : "Variation learned. Return to the core line or add another branch to your memory."} Your next review is ${nextReview}.</p><div class="completion-actions"><button class="button button-ghost" type="button" data-practice-again>Practice again</button><a class="button" href="#review">Next review <span aria-hidden="true">→</span></a></div>`;
    }
    if (type === "timeout") {
      body = `<div class="coach-state-icon hint" aria-hidden="true">0:00</div><p class="eyebrow centered">Sprint complete</p><h2>${this.correctUserMoves} move${this.correctUserMoves === 1 ? "" : "s"} recalled.</h2><p>Speed grows from accurate patterns. Repeat this line, switch to Recall, or let the review queue bring it back later.</p><div class="completion-actions"><button class="button" type="button" data-practice-again>Try again</button><a class="button button-ghost" href="#review">Review queue</a></div>`;
    }

    container.innerHTML = `<div class="coach-card ${type}">${commonTop}${body}</div>`;
    container.querySelector("[data-practice-again]")?.addEventListener("click", () => this.start());
  }

  destroy() {
    this.recordInterruptedReview();
    window.clearTimeout(this.pendingTimer);
    window.clearInterval(this.countdownTimer);
  }
}
