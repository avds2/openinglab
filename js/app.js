import { OPENINGS, getOpening } from "./openings/index.js";
import { ProgressStore, STORAGE_KEY, STORAGE_VERSION } from "./storage.js";
import { LessonController } from "./lesson.js";
import { PracticeController, practicePageMarkup } from "./practice.js";
import { QuizController, quizPageMarkup } from "./quiz.js";
import { decorativePiece } from "./pieces.js";
import { setupPWA } from "./pwa.js";
import { APP_VERSION } from "./version.js";

const app = document.querySelector("#app");
const store = new ProgressStore(OPENINGS);
const COURSE_COUNT = OPENINGS.length;
const MODULE_COUNT = COURSE_COUNT * 3;
const THEME_KEY = "openinglab-theme";
const systemTheme = window.matchMedia("(prefers-color-scheme: light)");
const state = {
  search: "",
  filter: "All",
  controller: null,
  toastTimer: null,
  persistenceToastShown: false,
  hasRouted: false,
};

function applyTheme(theme, persist = true) {
  const next = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  document.querySelector("#theme-color-meta")?.setAttribute("content", next === "light" ? "#f4f2ec" : "#10120f");
  const button = document.querySelector("#theme-toggle");
  const label = document.querySelector("#theme-label");
  const target = next === "dark" ? "light" : "dark";
  if (button) button.setAttribute("aria-label", `Switch to ${target} mode`);
  if (label) label.textContent = target === "light" ? "Light" : "Dark";
  if (persist) {
    document.documentElement.dataset.themeSource = "user";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // The visual theme still works when storage is unavailable.
    }
  }
}

function hasSavedTheme() {
  try {
    return ["light", "dark"].includes(localStorage.getItem(THEME_KEY));
  } catch {
    return false;
  }
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  window.clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  state.toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function downloadJSON(contents, filename) {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function openingProgress(opening) {
  return store.openingPercent(opening.id);
}

function setActiveNav(route) {
  const section =
    route.type === "opening"
      ? ["practice", "quiz"].includes(route.mode)
        ? route.mode
        : "learn"
      : route.type === "home"
        ? "learn"
        : route.type;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const active = link.dataset.nav === section;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function parseRoute() {
  const raw = window.location.hash.replace(/^#\/?/, "") || "home";
  const parts = raw.split("/").filter(Boolean);
  if (parts[0] === "opening" && parts[1]) {
    return {
      type: "opening",
      id: parts[1],
      mode: parts[2] || "lesson",
      lineKey: parts[3] || "main",
      trainingMode: parts[4] || "guided",
    };
  }
  if (["home", "practice", "quiz", "review", "progress"].includes(parts[0])) {
    return { type: parts[0] };
  }
  return { type: "home" };
}

function renderOpeningCard(opening, index, actionLabel = "Open course", href = `#opening/${opening.id}`, animate = true) {
  const progress = store.get(opening.id);
  const percent = openingProgress(opening);
  const favorite = store.isFavorite(opening.id);
  const tone = opening.side === "Black" ? "dark" : "light";
  const lineCount = opening.variations.length + 1;
  return `
    <a class="opening-card side-${opening.side.toLowerCase()} ${animate ? "card-animate" : ""}" style="--card-order:${Math.min(index, 12)}" href="${href}" aria-label="${escapeHTML(actionLabel)}: ${escapeHTML(opening.name)}, ${lineCount} instructional lines, ${percent}% learned">
      <div class="card-content">
        <div class="card-topline">
          <span class="side-badge"><span class="side-dot ${opening.side.toLowerCase()}"></span>${opening.side}</span>
          <span class="difficulty-badge">${escapeHTML(opening.difficulty)}</span>
          ${favorite ? '<span class="favorite-badge">★ Saved</span>' : ""}
          ${progress.mastered ? '<span class="mastery-badge">✓ Mastered</span>' : ""}
        </div>
        <h2>${escapeHTML(opening.name)}</h2>
        <p class="opening-sequence">${escapeHTML(opening.startingMoves)}</p>
        <div class="tag-row">${opening.style.slice(0, 3).map((tag) => `<span class="tag">${escapeHTML(tag)}</span>`).join("")}</div>
        <div class="card-progress" aria-label="${percent}% learned">
          <span class="card-line-count">${lineCount} line${lineCount === 1 ? "" : "s"}</span><div class="progress-track"><span style="width:${percent}%"></span></div><span>${percent}%</span>
        </div>
      </div>
      <div class="card-visual" aria-hidden="true">
        <span class="card-piece">${decorativePiece(opening.glyph, tone)}</span>
        <span class="card-number">${String(index + 1).padStart(2, "0")}</span>
      </div>
    </a>`;
}

function filteredOpenings() {
  const search = state.search.trim().toLowerCase();
  return OPENINGS.filter((opening) => {
    const matchesSearch = !search || opening.name.toLowerCase().includes(search);
    const filter = state.filter;
    const matchesFilter =
      filter === "All" ||
      opening.side === filter ||
      opening.difficulty === filter ||
      opening.style.includes(filter) ||
      (filter === "Favorites" && store.isFavorite(opening.id)) ||
      (filter === "Mastered" && store.get(opening.id).mastered) ||
      (filter === "Not mastered" && !store.get(opening.id).mastered);
    return matchesSearch && matchesFilter;
  });
}

function updateHomeResults(animate = false) {
  const visible = filteredOpenings();
  const grid = app.querySelector("#opening-grid");
  const count = app.querySelector("#opening-result-count");
  if (grid) {
    grid.innerHTML = visible.length
      ? visible.map((opening) => renderOpeningCard(opening, OPENINGS.indexOf(opening), "Open course", `#opening/${opening.id}`, animate)).join("")
      : `<div class="empty-state">${decorativePiece("♙")}<strong>No opening matches.</strong><p>Try another name or reset the library filters.</p><button class="button button-ghost" type="button" data-clear-library>Clear filters</button></div>`;
  }
  if (count) count.textContent = `${visible.length} course${visible.length === 1 ? "" : "s"}`;
  app.querySelectorAll("[data-filter]").forEach((button) => {
    const active = button.dataset.filter === state.filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderHome() {
  const stats = store.stats();
  const reviewStats = store.reviewSummary(OPENINGS);
  const lastOpening = getOpening(store.lastOpeningId());
  const suggested = lastOpening || getOpening("italian") || OPENINGS[0];
  const visible = filteredOpenings();
  const filters = ["All", "Mastered", "Not mastered", "Favorites", "White", "Black", "Beginner", "Intermediate", "Advanced", "Tactical", "Positional"];
  app.innerHTML = `
    <section class="page-shell page-enter">
      <div class="page-heading">
        <div>
          <p class="eyebrow">Your opening repertoire</p>
          <h1>Build positions you understand.</h1>
          <p>${COURSE_COUNT} major openings, from first principles to critical branches. Learn the purpose of every move, reproduce each line, then prove you recognize the ideas.</p>
          <div class="trust-row" aria-label="OpeningLab promises"><span>Free forever</span><span>No sign-up</span><span>No tracking</span><span>Works offline</span></div>
        </div>
        <div class="library-summary">
          <div class="summary-ring" style="--progress:${stats.totalPercent * 3.6}deg"><strong>${stats.totalPercent}%</strong></div>
          <div><strong>${stats.learned} of ${COURSE_COUNT} lessons learned</strong><span>${stats.mastered} mastered · progress saved locally</span></div>
        </div>
      </div>

      <section class="study-strip" aria-label="Next study session">
        <div class="study-strip-icon" aria-hidden="true">${reviewStats.due ? "↻" : "→"}</div>
        <div>
          <span>${reviewStats.due ? "Ready for review" : lastOpening ? "Continue learning" : "Recommended first course"}</span>
          <strong>${reviewStats.due ? `${reviewStats.due} line${reviewStats.due === 1 ? " is" : "s are"} due for recall` : escapeHTML(suggested.name)}</strong>
          <small>${reviewStats.due ? "Short, spaced reps keep the moves available without overstudying." : "Pick up exactly where you left off, or start a focused training session."}</small>
        </div>
        <div class="study-strip-actions">
          <a class="button" href="${reviewStats.due ? "#review" : `#opening/${suggested.id}`}">${reviewStats.due ? "Review now" : lastOpening ? "Continue" : "Start course"} <span aria-hidden="true">→</span></a>
          <a class="button button-ghost" href="#review">Review queue</a>
        </div>
      </section>

      <div class="library-tools">
        <label class="search-wrap">
          <span class="sr-only">Search openings</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>
          <input class="search-input" id="opening-search" type="search" placeholder="Search an opening…" value="${escapeHTML(state.search)}" autocomplete="off" />
          <kbd aria-hidden="true">/</kbd>
        </label>
        <div class="filter-row" role="group" aria-label="Filter openings">
          ${filters.map((filter) => `<button class="filter-chip ${state.filter === filter ? "active" : ""}" type="button" data-filter="${filter}" aria-pressed="${state.filter === filter}">${filter}</button>`).join("")}
        </div>
        <span class="result-count" id="opening-result-count" aria-live="polite">${visible.length} course${visible.length === 1 ? "" : "s"}</span>
      </div>

      <div class="opening-grid" id="opening-grid">
        ${visible.length ? visible.map((opening) => renderOpeningCard(opening, OPENINGS.indexOf(opening))).join("") : `<div class="empty-state">${decorativePiece("♙")}<strong>No opening matches.</strong><p>Try another name or reset the library filters.</p><button class="button button-ghost" type="button" data-clear-library>Clear filters</button></div>`}
      </div>
    </section>`;

  const search = app.querySelector("#opening-search");
  search?.addEventListener("input", (event) => {
    state.search = event.target.value;
    updateHomeResults(false);
  });

  app.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      updateHomeResults(false);
    });
  });

  app.querySelector("#opening-grid")?.addEventListener("click", (event) => {
    if (!event.target.closest("[data-clear-library]")) return;
    state.search = "";
    state.filter = "All";
    if (search) search.value = "";
    updateHomeResults(true);
    search?.focus();
  });
}

function lessonMarkup(opening) {
  const progress = store.get(opening.id);
  const percent = openingProgress(opening);
  return `
    <section class="lesson-shell page-enter">
      <div class="lesson-breadcrumbs"><a href="#home">Opening library</a><span aria-hidden="true">/</span><span>${escapeHTML(opening.name)}</span></div>
      <header class="lesson-header">
        <div class="lesson-title-wrap">
          <span class="opening-glyph" aria-hidden="true">${decorativePiece(opening.glyph)}</span>
          <div>
            <h1>${escapeHTML(opening.name)}</h1>
            <div class="lesson-meta"><span>${opening.side} repertoire</span><i></i><span>${opening.difficulty}</span><i></i><span>${escapeHTML(opening.startingMoves)}</span></div>
          </div>
        </div>
        <div class="lesson-header-actions">
          <button class="favorite-button ${store.isFavorite(opening.id) ? "active" : ""}" id="favorite-opening" type="button" aria-pressed="${store.isFavorite(opening.id)}" aria-label="${store.isFavorite(opening.id) ? "Remove" : "Save"} ${escapeHTML(opening.name)} ${store.isFavorite(opening.id) ? "from" : "to"} favorites"><span aria-hidden="true">★</span><span>${store.isFavorite(opening.id) ? "Saved" : "Save"}</span></button>
          <div class="lesson-status">
            <span>${progress.mastered ? "Mastered" : progress.lessonComplete ? "Lesson complete" : "Course in progress"}</span>
            <div class="progress-track compact-progress"><span style="width:${percent}%"></span></div>
            <strong>${percent}%</strong>
          </div>
        </div>
      </header>

      <div class="lesson-layout">
        <div class="board-column">
          <div class="board-frame"><div class="chessboard" id="lesson-board" role="group"></div></div>
          <div class="board-toolbar">
            <span class="turn-indicator"><span class="turn-dot" id="turn-dot"></span><span id="turn-label">White to move</span><span aria-hidden="true">·</span><span id="current-move-label">Start</span></span>
            <div class="board-actions">
              <button class="icon-button" id="next-hint" type="button" aria-label="Show next move hint" title="Show next move">?</button>
              <button class="icon-button" id="reset-board" type="button" aria-label="Reset board" title="Reset position">↺</button>
              <button class="icon-button" id="flip-board" type="button" aria-label="Flip board" title="Flip board">⇅</button>
            </div>
          </div>
        </div>

        <article class="lesson-panel">
          <div class="lesson-tabs" role="tablist" aria-label="Lesson sections">
            ${["overview", "moves", "ideas", "practice"].map((tab, index) => `<button class="lesson-tab ${index === 0 ? "active" : ""}" id="lesson-tab-${tab}" type="button" role="tab" aria-selected="${index === 0}" aria-controls="lesson-panel-content" tabindex="${index === 0 ? "0" : "-1"}" data-lesson-tab="${tab}">${tab[0].toUpperCase()}${tab.slice(1)}</button>`).join("")}
          </div>
          <div class="panel-content" id="lesson-panel-content" role="tabpanel" aria-labelledby="lesson-tab-overview"></div>
        </article>
      </div>
    </section>`;
}

function renderLesson(id) {
  const opening = getOpening(id);
  if (!opening) {
    window.location.hash = "#home";
    return;
  }
  store.markVisited(id);
  app.innerHTML = lessonMarkup(opening);
  state.controller = new LessonController({
    opening,
    root: app,
    store,
    onProgressChange: () => {
      const value = app.querySelector(".lesson-status strong");
      const track = app.querySelector(".lesson-status .progress-track span");
      const label = app.querySelector(".lesson-status > span");
      const percent = openingProgress(opening);
      const progress = store.get(opening.id);
      if (value) value.textContent = `${percent}%`;
      if (track) track.style.width = `${percent}%`;
      if (label) label.textContent = progress.mastered ? "Mastered" : progress.lessonComplete ? "Lesson complete" : "Course in progress";
    },
    onNavigatePractice: (openingId) => {
      window.location.hash = `#opening/${openingId}/practice`;
    },
    onToast: showToast,
  });

  app.querySelectorAll("[data-lesson-tab]").forEach((button) => {
    button.addEventListener("click", () => state.controller?.setTab(button.dataset.lessonTab));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...app.querySelectorAll("[data-lesson-tab]")];
      const current = tabs.indexOf(button);
      let next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : current + (event.key === "ArrowRight" ? 1 : -1);
      next = (next + tabs.length) % tabs.length;
      state.controller?.setTab(tabs[next].dataset.lessonTab);
      tabs[next].focus();
    });
  });

  app.querySelector("#favorite-opening")?.addEventListener("click", (event) => {
    const favorite = store.toggleFavorite(opening.id);
    event.currentTarget.classList.toggle("active", favorite);
    event.currentTarget.setAttribute("aria-pressed", String(favorite));
    event.currentTarget.setAttribute("aria-label", `${favorite ? "Remove" : "Save"} ${opening.name} ${favorite ? "from" : "to"} favorites`);
    event.currentTarget.querySelector("span:last-child").textContent = favorite ? "Saved" : "Save";
    showToast(favorite ? `${opening.name} saved to favorites.` : `${opening.name} removed from favorites.`);
  });
}

function renderPractice(id, lineKey = "main", trainingMode = "guided") {
  const opening = getOpening(id);
  if (!opening) {
    window.location.hash = "#practice";
    return;
  }
  store.markVisited(id);
  app.innerHTML = practicePageMarkup(opening, store.get(id), { lineKey, mode: trainingMode });
  state.controller = new PracticeController({
    opening,
    root: app,
    store,
    onToast: showToast,
    initialLineKey: lineKey,
    initialMode: trainingMode,
  });
}

function renderQuiz(id) {
  const opening = getOpening(id);
  if (!opening) {
    window.location.hash = "#quiz";
    return;
  }
  store.markVisited(id);
  app.innerHTML = quizPageMarkup(opening, store.get(id));
  state.controller = new QuizController({
    opening,
    root: app,
    store,
    onToast: showToast,
  });
}

function renderModeLibrary(mode) {
  const copy = {
    practice: {
      eyebrow: "Board training",
      title: "Turn knowledge into muscle memory.",
      text: "Choose an opening, then reproduce its main line from the starting position. Your opponent replies automatically.",
      action: "Choose for practice",
    },
    quiz: {
      eyebrow: "Knowledge checks",
      title: "Recognize the move—and the reason.",
      text: "Each five-question quiz mixes move recognition, strategic plans, structures, and common mistakes.",
      action: "Choose a quiz",
    },
  }[mode];
  app.innerHTML = `
    <section class="page-shell page-enter">
      <div class="page-heading">
        <div><p class="eyebrow">${copy.eyebrow}</p><h1>${copy.title}</h1><p>${copy.text}</p></div>
      </div>
      <div class="opening-grid">
        ${OPENINGS.map((opening, index) => renderOpeningCard(opening, index, copy.action, `#opening/${opening.id}/${mode}`)).join("")}
      </div>
    </section>`;
}

function reviewTiming(review) {
  if (!review) return { label: "New line", className: "new" };
  const remaining = new Date(review.nextReview).getTime() - Date.now();
  if (remaining <= 0) return { label: "Due now", className: "due" };
  const hours = Math.max(1, Math.ceil(remaining / (60 * 60 * 1000)));
  if (hours < 24) return { label: `In ${hours}h`, className: "scheduled" };
  const days = Math.ceil(hours / 24);
  return { label: `In ${days}d`, className: "scheduled" };
}

function renderReview() {
  const summary = store.reviewSummary(OPENINGS);
  const queue = store.reviewQueue(OPENINGS, 12);
  const first = queue[0];
  const firstBase = first ? `#opening/${first.opening.id}/practice/${first.lineKey}` : "#practice";
  app.innerHTML = `
    <section class="page-shell page-enter review-page">
      <div class="page-heading review-heading">
        <div>
          <p class="eyebrow">Adaptive review</p>
          <h1>Remember the line, not just the lesson.</h1>
          <p>Your queue schedules shorter intervals after a difficult rep and longer gaps after a clean recall. Everything stays on this device.</p>
        </div>
        <a class="button" href="${first ? `${firstBase}/recall` : "#practice"}">${summary.due ? `Start ${summary.due} due` : "Start next rep"} <span aria-hidden="true">→</span></a>
      </div>

      <div class="review-metrics" aria-label="Review progress">
        <div><strong>${summary.due}</strong><span>Due now</span></div>
        <div><strong>${summary.reviewed} / ${summary.totalLines}</strong><span>Lines reviewed</span></div>
        <div><strong>${summary.average}%</strong><span>Recall accuracy</span></div>
        <div><strong>${summary.strong}</strong><span>Strong lines</span></div>
      </div>

      <div class="training-mode-grid">
        <a class="training-mode-card" href="${firstBase}/guided">
          <span class="mode-kicker">Learn</span><strong>Guided</strong><p>Progressive hints reveal the piece and destination only when you need them.</p><span class="mode-link">Start with support →</span>
        </a>
        <a class="training-mode-card featured" href="${firstBase}/recall">
          <span class="mode-kicker">Practice</span><strong>Recall</strong><p>Reproduce the line without automatic square hints. Ask for one only if you are stuck.</p><span class="mode-link">Test your memory →</span>
        </a>
        <a class="training-mode-card" href="${firstBase}/sprint">
          <span class="mode-kicker">Drill</span><strong>60-second Sprint</strong><p>Build fast recognition under a calm timer; accuracy still matters more than speed.</p><span class="mode-link">Start the clock →</span>
        </a>
      </div>

      <section class="review-queue-section">
        <div class="section-heading-row">
          <div><p class="eyebrow">Next repetitions</p><h2>Your review queue</h2></div>
          <span>${store.data.favorites.length} saved opening${store.data.favorites.length === 1 ? "" : "s"}</span>
        </div>
        <div class="review-queue">
          ${queue.map((entry) => {
            const timing = reviewTiming(entry.review);
            const tone = entry.opening.side === "Black" ? "dark" : "light";
            return `<article class="review-row">
              <span class="review-piece side-${entry.opening.side.toLowerCase()}" aria-hidden="true">${decorativePiece(entry.opening.glyph, tone)}</span>
              <div class="review-line-title"><strong>${escapeHTML(entry.opening.name)}</strong><span>${escapeHTML(entry.line.name)} · ${entry.opening.side}</span></div>
              <div class="review-accuracy"><strong>${entry.review ? `${entry.review.accuracy}%` : "—"}</strong><span>Accuracy</span></div>
              <span class="review-timing ${timing.className}">${timing.label}</span>
              <div class="review-row-actions"><a class="button button-ghost" href="#opening/${entry.opening.id}/practice/${entry.lineKey}/guided">Guide</a><a class="button" href="#opening/${entry.opening.id}/practice/${entry.lineKey}/recall">Recall</a></div>
            </article>`;
          }).join("")}
        </div>
      </section>
    </section>`;
}

function renderProgressPreview() {
  const stats = store.stats();
  const reviewStats = store.reviewSummary(OPENINGS);
  app.innerHTML = `
    <section class="page-shell page-enter">
      <div class="dashboard-hero">
        <div class="dashboard-intro">
          <p class="eyebrow">Course progress</p>
          <h1>${stats.totalPercent}% of your repertoire built.</h1>
          <p>Mastery means you have understood the line, reproduced it on the board, and scored at least 80% in the opening quiz.</p>
        </div>
        <div class="mastery-card">
          <div class="mastery-ring-large" style="--progress:${stats.mastered * (360 / COURSE_COUNT)}deg"><div><strong>${stats.mastered}/${COURSE_COUNT}</strong><span>Mastered</span></div></div>
          <div><h2>${stats.mastered ? "Your repertoire is taking shape." : "Your first mastery badge is waiting."}</h2><p>${stats.mastered === COURSE_COUNT ? "Every opening is mastered. Keep the patterns fresh through mixed practice." : `${COURSE_COUNT - stats.mastered} opening${COURSE_COUNT - stats.mastered === 1 ? "" : "s"} remain on the full mastery path.`}</p></div>
        </div>
      </div>

      <div class="metric-grid">
        <div class="metric-card"><span class="metric-icon" aria-hidden="true">${decorativePiece("♙")}</span><div><strong>${stats.learned} / ${COURSE_COUNT}</strong><span>Guided lessons completed</span></div></div>
        <div class="metric-card"><span class="metric-icon" aria-hidden="true">✓</span><div><strong>${stats.modulesComplete} / ${MODULE_COUNT}</strong><span>Learning modules cleared</span></div></div>
        <div class="metric-card"><span class="metric-icon" aria-hidden="true">?</span><div><strong>${stats.quizAccuracy}%</strong><span>Quiz accuracy · ${stats.quizAnswered} answers</span></div></div>
        <div class="metric-card"><span class="metric-icon" aria-hidden="true">↻</span><div><strong>${reviewStats.due}</strong><span>Lines due · ${reviewStats.reviewed} reviewed</span></div></div>
      </div>

      <div class="local-data-note">
        <span class="local-data-icon" aria-hidden="true">◇</span>
        <div><strong>Private by design</strong><p>No account, ads, analytics, or cloud profile. Your learning data stays in this browser unless you export a backup yourself.</p><span class="app-version">OpeningLab v${APP_VERSION} · local data schema v${STORAGE_VERSION}</span></div>
        <div class="local-data-actions"><button class="button button-ghost" type="button" id="export-progress">Export backup</button><button class="button button-ghost" type="button" id="import-progress">Restore backup</button>${store.hasRecovery() ? '<button class="button button-ghost" type="button" id="export-recovery">Download recovery copy</button>' : ""}<input class="sr-only" id="import-progress-file" type="file" accept="application/json,.json" aria-label="Choose an OpeningLab progress backup" /></div>
      </div>

      <div class="progress-table-wrap">
        <div class="progress-table-head"><div><p class="eyebrow compact">Opening path</p><h2>Learn → Practice → Quiz</h2></div><button class="button button-ghost" type="button" id="reset-progress">Reset progress</button></div>
        <div class="course-progress-list">
          ${OPENINGS.map((opening) => {
            const progress = store.get(opening.id);
            const percent = openingProgress(opening);
            return `<div class="course-progress-row">
              <div class="course-name-cell"><span class="course-mini-glyph" aria-hidden="true">${decorativePiece(opening.glyph)}</span><div><strong>${escapeHTML(opening.name)}</strong><span>${opening.side} · ${opening.difficulty}${progress.mastered ? " · Mastered" : ""}</span></div></div>
              <div class="row-progress"><div class="progress-track"><span style="width:${percent}%"></span></div><span>${percent}%</span></div>
              <span class="module-status ${progress.lessonComplete ? "done" : ""}">Learn</span>
              <span class="module-status ${progress.practiceComplete ? "done" : ""}">Practice</span>
              <span class="module-status ${progress.bestQuizScore >= 80 ? "done" : ""}">Quiz ${progress.bestQuizScore ? `${progress.bestQuizScore}%` : ""}</span>
              <a class="row-action" href="#opening/${opening.id}">${progress.visited ? "Continue →" : "Start →"}</a>
            </div>`;
          }).join("")}
        </div>
      </div>
    </section>`;
  app.querySelector("#reset-progress")?.addEventListener("click", openResetDialog);
  app.querySelector("#export-progress")?.addEventListener("click", () => {
    downloadJSON(store.exportJSON(), `openinglab-progress-${new Date().toISOString().slice(0, 10)}.json`);
    showToast("Private progress backup downloaded.");
  });
  app.querySelector("#export-recovery")?.addEventListener("click", () => {
    const recovery = store.exportRecoveryJSON();
    if (!recovery) {
      showToast("No recovery copy is available in this browser.");
      return;
    }
    downloadJSON(recovery, `openinglab-recovery-${new Date().toISOString().slice(0, 10)}.json`);
    showToast("Recovery copy downloaded. Keep it until you have confirmed your progress.");
  });
  app.querySelector("#import-progress")?.addEventListener("click", () => app.querySelector("#import-progress-file")?.click());
  app.querySelector("#import-progress-file")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const report = store.importJSON(await file.text());
      showToast(report.warnings.length ? `Progress restored with ${report.warnings.length} compatibility note${report.warnings.length === 1 ? "" : "s"}.` : "Progress restored from your backup.");
      renderProgressPreview();
    } catch (error) {
      showToast(error?.message || "That backup could not be restored.");
    } finally {
      event.target.value = "";
    }
  });
}

function openResetDialog() {
  const dialog = document.querySelector("#confirm-dialog");
  if (!dialog) return;
  dialog.returnValue = "";
  dialog.showModal();
  dialog.addEventListener(
    "close",
    () => {
      if (dialog.returnValue === "confirm") {
        store.reset();
        showToast("Progress reset. Your course is ready for a fresh start.");
        renderProgressPreview();
      }
    },
    { once: true },
  );
}

function route() {
  state.controller?.destroy?.();
  state.controller = null;
  const current = parseRoute();
  setActiveNav(current);

  if (current.type === "opening" && current.mode === "practice") renderPractice(current.id, current.lineKey, current.trainingMode);
  else if (current.type === "opening" && current.mode === "quiz") renderQuiz(current.id);
  else if (current.type === "opening") renderLesson(current.id);
  else if (current.type === "home") renderHome();
  else if (current.type === "practice" || current.type === "quiz") renderModeLibrary(current.type);
  else if (current.type === "review") renderReview();
  else if (current.type === "progress") renderProgressPreview();

  const heading = app.querySelector("h1")?.textContent?.trim();
  const announcer = document.querySelector("#route-announcer");
  if (announcer && heading) announcer.textContent = `${heading} view loaded`;

  if (state.hasRouted) {
    const headingElement = app.querySelector("h1");
    headingElement?.setAttribute("tabindex", "-1");
    headingElement?.focus({ preventScroll: true });
  }
  state.hasRouted = true;

  window.scrollTo({ top: 0, behavior: "auto" });
}

document.querySelector("#theme-toggle")?.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
});

systemTheme.addEventListener?.("change", (event) => {
  if (hasSavedTheme()) return;
  document.documentElement.dataset.themeSource = "system";
  applyTheme(event.matches ? "light" : "dark", false);
});

window.addEventListener("storage", (event) => {
  if (event.key !== THEME_KEY) return;
  const saved = ["light", "dark"].includes(event.newValue) ? event.newValue : null;
  document.documentElement.dataset.themeSource = saved ? "user" : "system";
  applyTheme(saved || (systemTheme.matches ? "light" : "dark"), false);
});

document.addEventListener("keydown", (event) => {
  const routeState = parseRoute();
  const target = event.target;
  const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName) || target?.isContentEditable;
  if (event.key === "/" && routeState.type === "home" && !isTyping) {
    event.preventDefault();
    app.querySelector("#opening-search")?.focus();
  }
  if (event.key === "Escape" && target?.id === "opening-search" && target.value) {
    target.value = "";
    state.search = "";
    updateHomeResults(false);
  }
});

window.addEventListener("hashchange", route);
store.subscribe((event) => {
  if (!event.saved && !state.persistenceToastShown) {
    state.persistenceToastShown = true;
    showToast("Progress changed for this session, but this browser did not allow it to be saved.");
  }
  if (parseRoute().type === "home" && app.querySelector("#opening-grid")) updateHomeResults(false);
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) store.reload();
});

applyTheme(document.documentElement.dataset.theme || (systemTheme.matches ? "light" : "dark"), false);
route();

if (store.getStartupWarning()) {
  window.setTimeout(() => showToast(store.getStartupWarning()), 300);
}

setupPWA();
