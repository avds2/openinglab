import { Chessboard, positionAt } from "./board.js";
import { decorativePiece } from "./pieces.js";

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function positionPlyForQuestion(opening, question) {
  if (Number.isInteger(question.ply)) {
    return Math.max(0, Math.min(opening.mainLine.moves.length, question.ply));
  }
  const startingPly = opening.startingMoves.trim().split(/\s+/).filter(Boolean).length;
  const openingPositionTypes = new Set(["Recognition", "Position", "Setup", "Variation"]);
  const continuationTypes = new Set(["Continuation", "Development", "Main line", "Modern line", "Main break"]);
  const extraPlies = openingPositionTypes.has(question.type) ? 0 : continuationTypes.has(question.type) ? 2 : 4;
  return Math.min(opening.mainLine.moves.length, startingPly + extraPlies);
}

export function quizPageMarkup(opening, progress) {
  return `
    <section class="lesson-shell quiz-page page-enter">
      <div class="lesson-breadcrumbs"><a href="#home">Opening library</a><span aria-hidden="true">/</span><a href="#opening/${opening.id}">${escapeHTML(opening.name)}</a><span aria-hidden="true">/</span><span>Quiz</span></div>
      <header class="lesson-header">
        <div class="lesson-title-wrap">
          <span class="opening-glyph" aria-hidden="true">${decorativePiece(opening.glyph)}</span>
          <div><p class="eyebrow compact">Opening knowledge check</p><h1>${escapeHTML(opening.name)} Quiz</h1><div class="lesson-meta"><span>5 questions</span><i></i><span>Best score: ${progress.bestQuizScore}%</span><i></i><span>Mastery target: 80%</span></div></div>
        </div>
        <div class="quiz-score-live"><span>Score</span><strong id="quiz-live-score">0 / 0</strong></div>
      </header>

      <div class="quiz-layout">
        <aside class="quiz-board-column">
          <div class="quiz-board-label"><span>Position reference</span><span id="quiz-position-ply">Opening setup</span></div>
          <div class="board-frame quiz-board-frame"><div class="chessboard" id="quiz-board" role="group"></div></div>
          <div class="quiz-board-note"><span aria-hidden="true">✦</span><p id="quiz-board-note">Read the position before choosing. The board updates with each concept.</p></div>
        </aside>

        <article class="quiz-panel">
          <div class="quiz-progress-head"><span id="quiz-question-count">Question 1 of 5</span><span id="quiz-type">Recognition</span><small title="Keyboard shortcuts">Keys 1–4</small></div>
          <div class="progress-track quiz-progress"><span id="quiz-progress-bar"></span></div>
          <div id="quiz-content" aria-live="polite"></div>
        </article>
      </div>
    </section>`;
}

export class QuizController {
  constructor({ opening, root, store, onProgressChange, onToast }) {
    this.opening = opening;
    this.root = root;
    this.store = store;
    this.onProgressChange = onProgressChange;
    this.onToast = onToast;
    this.allIndices = opening.quiz.map((_, index) => index);
    this.questionIndices = [...this.allIndices];
    this.current = 0;
    this.correct = 0;
    this.selected = null;
    this.missed = [];
    this.retryMode = false;
    this.finished = false;
    this.board = new Chessboard(root.querySelector("#quiz-board"), {
      orientation: opening.side.toLowerCase(),
      interactive: false,
    });
    this.keyboardHandler = (event) => {
      const tag = event.target?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(tag) || this.finished) return;
      const shortcuts = { "1": 0, a: 0, "2": 1, b: 1, "3": 2, c: 2, "4": 3, d: 3 };
      const answer = shortcuts[event.key.toLowerCase()];
      if (this.selected === null && answer !== undefined) {
        event.preventDefault();
        this.answer(answer);
      } else if (this.selected !== null && ["Enter", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        this.next();
      }
    };
    document.addEventListener("keydown", this.keyboardHandler);
    this.renderQuestion();
  }

  get questionIndex() {
    return this.questionIndices[this.current];
  }

  get question() {
    return this.opening.quiz[this.questionIndex];
  }

  renderQuestion() {
    this.finished = false;
    this.selected = null;
    const question = this.question;
    const total = this.questionIndices.length;
    const count = this.root.querySelector("#quiz-question-count");
    const type = this.root.querySelector("#quiz-type");
    const bar = this.root.querySelector("#quiz-progress-bar");
    if (count) count.textContent = `${this.retryMode ? "Retry" : "Question"} ${this.current + 1} of ${total}`;
    if (type) type.textContent = question.type;
    if (bar) bar.style.width = `${(this.current / total) * 100}%`;

    const displayPly = positionPlyForQuestion(this.opening, question);
    this.board.setPosition(
      positionAt(this.opening.mainLine.moves, displayPly),
      this.opening.mainLine.moves[displayPly - 1] || null,
    );
    const plyLabel = this.root.querySelector("#quiz-position-ply");
    if (plyLabel) plyLabel.textContent = `${displayPly} pl${displayPly === 1 ? "y" : "ies"} shown`;

    const content = this.root.querySelector("#quiz-content");
    if (!content) return;
    content.innerHTML = `
      <div class="quiz-question page-enter">
        <span class="question-number">${String(this.current + 1).padStart(2, "0")}</span>
        <h2>${escapeHTML(question.prompt)}</h2>
        <div class="answer-list" role="group" aria-label="Answer choices">
          ${question.choices
            .map(
              (choice, index) => `<button class="answer-option" type="button" data-answer="${index}" aria-keyshortcuts="${index + 1} ${String.fromCharCode(65 + index)}">
                <span class="answer-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHTML(choice)}</span>
              </button>`,
            )
            .join("")}
        </div>
        <div class="answer-feedback" id="answer-feedback" hidden></div>
      </div>`;
    content.querySelectorAll("[data-answer]").forEach((button) => {
      button.addEventListener("click", () => this.answer(Number(button.dataset.answer)));
    });
    this.updateLiveScore();
  }

  answer(index) {
    if (this.selected !== null) return;
    this.selected = index;
    const question = this.question;
    const isCorrect = index === question.answer;
    if (isCorrect) this.correct += 1;
    else this.missed.push(this.questionIndex);

    this.root.querySelectorAll("[data-answer]").forEach((button) => {
      const answer = Number(button.dataset.answer);
      button.disabled = true;
      if (answer === question.answer) button.classList.add("correct");
      if (answer === index && !isCorrect) button.classList.add("incorrect");
    });

    const feedback = this.root.querySelector("#answer-feedback");
    if (feedback) {
      feedback.hidden = false;
      feedback.className = `answer-feedback ${isCorrect ? "correct" : "incorrect"}`;
      feedback.innerHTML = `
        <div class="feedback-title"><span aria-hidden="true">${isCorrect ? "✓" : "×"}</span><strong>${isCorrect ? "Correct" : "Not quite"}</strong></div>
        <p>${escapeHTML(question.explanation)}</p>
        <button class="button" type="button" id="quiz-next">${this.current === this.questionIndices.length - 1 ? "See results" : "Next question"} <span aria-hidden="true">→</span></button>`;
      feedback.querySelector("#quiz-next")?.addEventListener("click", () => this.next());
      feedback.querySelector("#quiz-next")?.focus();
    }

    const note = this.root.querySelector("#quiz-board-note");
    if (note) note.textContent = question.explanation;
    this.updateLiveScore();
  }

  next() {
    if (this.current < this.questionIndices.length - 1) {
      this.current += 1;
      this.renderQuestion();
    } else {
      this.finish();
    }
  }

  finish() {
    this.finished = true;
    const total = this.questionIndices.length;
    const score = total ? Math.round((this.correct / total) * 100) : 0;
    if (!this.retryMode) {
      this.store.recordQuiz(this.opening.id, this.correct, total);
      this.onProgressChange?.();
    }

    const bar = this.root.querySelector("#quiz-progress-bar");
    if (bar) bar.style.width = "100%";
    const count = this.root.querySelector("#quiz-question-count");
    if (count) count.textContent = this.retryMode ? "Retry complete" : "Quiz complete";
    const type = this.root.querySelector("#quiz-type");
    if (type) type.textContent = score >= 80 ? "Mastery standard reached" : "Review recommended";

    this.board.setPosition(
      positionAt(this.opening.mainLine.moves, this.opening.mainLine.moves.length),
      this.opening.mainLine.moves.at(-1),
    );
    const plyLabel = this.root.querySelector("#quiz-position-ply");
    if (plyLabel) plyLabel.textContent = "Main line complete";
    const note = this.root.querySelector("#quiz-board-note");
    if (note) note.textContent = `${this.opening.memoryTip} Keep this mental model attached to the final position.`;

    const label = score >= 80 ? "Strong" : score >= 60 ? "Developing" : "Revisit the ideas";
    const progress = this.store.get(this.opening.id);
    const content = this.root.querySelector("#quiz-content");
    if (content) {
      content.innerHTML = `
        <div class="quiz-results page-enter">
          <div class="result-ring ${score >= 80 ? "strong" : ""}" style="--score:${score * 3.6}deg"><div><strong>${this.correct} / ${total}</strong><span>${score}%</span></div></div>
          <p class="eyebrow centered">Quiz complete</p>
          <h2>Opening knowledge: ${label}</h2>
          <p>${score >= 80 ? `You reached the mastery quiz threshold for the ${escapeHTML(this.opening.name)}.` : `Review the ideas behind the missed answers, then try again. Your best full-quiz score is ${progress.bestQuizScore}%.`}</p>
          <div class="result-stat-row"><span><small>Correct</small><strong>${this.correct}</strong></span><span><small>Missed</small><strong>${total - this.correct}</strong></span><span><small>Best</small><strong>${progress.bestQuizScore}%</strong></span></div>
          <div class="result-actions">
            ${this.missed.length ? '<button class="button button-ghost" type="button" data-retry-missed>Retry mistakes</button>' : ""}
            <button class="button button-ghost" type="button" data-restart-quiz>Restart quiz</button>
            <a class="button" href="#opening/${this.opening.id}/practice">Practice opening</a>
          </div>
          <a class="return-link" href="#opening/${this.opening.id}">Return to ${escapeHTML(this.opening.name)} course</a>
        </div>`;
      content.querySelector("[data-retry-missed]")?.addEventListener("click", () => this.retryMissed());
      content.querySelector("[data-restart-quiz]")?.addEventListener("click", () => this.restart());
    }
    this.updateLiveScore();
    this.onToast?.(score >= 80 ? "Quiz threshold reached — check your mastery status." : "Quiz saved. Review missed ideas and try again.");
  }

  retryMissed() {
    const missed = [...new Set(this.missed)];
    if (!missed.length) return;
    this.questionIndices = missed;
    this.current = 0;
    this.correct = 0;
    this.selected = null;
    this.missed = [];
    this.retryMode = true;
    this.renderQuestion();
  }

  restart() {
    this.questionIndices = [...this.allIndices];
    this.current = 0;
    this.correct = 0;
    this.selected = null;
    this.missed = [];
    this.retryMode = false;
    this.renderQuestion();
  }

  updateLiveScore() {
    const score = this.root.querySelector("#quiz-live-score");
    if (score) score.textContent = `${this.correct} / ${this.current + (this.selected !== null ? 1 : 0)}`;
  }

  destroy() {
    document.removeEventListener("keydown", this.keyboardHandler);
  }
}
