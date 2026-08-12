export const STORAGE_KEY = "openinglab-progress-v1";
export const RECOVERY_STORAGE_KEY = "openinglab-progress-recovery-v1";
export const STORAGE_VERSION = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const KNOWN_OPENING_FIELDS = new Set([
  "visited",
  "lessonComplete",
  "practiceComplete",
  "practiceAttempts",
  "quizAttempts",
  "quizCorrect",
  "quizAnswered",
  "bestQuizScore",
  "mastered",
  "lastStudied",
  "note",
]);
const KNOWN_DATA_FIELDS = new Set([
  "version",
  "openings",
  "progress",
  "lastOpening",
  "lastOpeningId",
  "studyStarted",
  "favorites",
  "favoriteIds",
  "lineReviews",
  "archived",
]);

const isRecord = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || 0));
const wholeCount = (value) => Math.floor(clamp(value, 0, Number.MAX_SAFE_INTEGER));
const safeDate = (value) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return null;
  return new Date(value).toISOString();
};

export const emptyOpeningProgress = () => ({
  visited: false,
  lessonComplete: false,
  practiceComplete: false,
  practiceAttempts: 0,
  quizAttempts: 0,
  quizCorrect: 0,
  quizAnswered: 0,
  bestQuizScore: 0,
  mastered: false,
  lastStudied: null,
  note: "",
});

export function normalizeOpening(value = {}, warnings = null, label = "opening") {
  const source = value === true ? { visited: true, lessonComplete: true } : isRecord(value) ? value : {};
  if (value !== undefined && value !== true && !isRecord(value)) {
    warnings?.push(`${label} had malformed progress and was reset safely.`);
  }
  const normalized = {
    visited: source.visited === true,
    lessonComplete: source.lessonComplete === true,
    practiceComplete: source.practiceComplete === true,
    practiceAttempts: wholeCount(source.practiceAttempts),
    quizAttempts: wholeCount(source.quizAttempts),
    quizCorrect: wholeCount(source.quizCorrect),
    quizAnswered: wholeCount(source.quizAnswered),
    bestQuizScore: Math.round(clamp(source.bestQuizScore, 0, 100)),
    mastered: false,
    lastStudied: safeDate(source.lastStudied),
    note: typeof source.note === "string" ? source.note.slice(0, 2000) : "",
  };
  normalized.quizCorrect = Math.min(normalized.quizCorrect, normalized.quizAnswered);
  normalized.mastered = Boolean(
    normalized.lessonComplete &&
      normalized.practiceComplete &&
      normalized.bestQuizScore >= 80,
  );
  return normalized;
}

export function normalizeLineReview(value = {}) {
  const source = isRecord(value) ? value : {};
  const attempts = wholeCount(source.attempts);
  const completions = Math.min(attempts, wholeCount(source.completions));
  const currentStreak = wholeCount(source.currentStreak);
  return {
    attempts,
    completions,
    accuracy: Math.round(clamp(source.accuracy, 0, 100)),
    intervalDays: clamp(source.intervalDays, 0, 60),
    currentStreak,
    bestStreak: Math.max(currentStreak, wholeCount(source.bestStreak)),
    lapses: wholeCount(source.lapses),
    lastReviewed: safeDate(source.lastReviewed),
    nextReview: safeDate(source.nextReview),
  };
}

export function calculateQuizScore(correct, total) {
  const safeTotal = wholeCount(total);
  const safeCorrect = Math.min(safeTotal, wholeCount(correct));
  return {
    correct: safeCorrect,
    total: safeTotal,
    percent: safeTotal ? Math.round((safeCorrect / safeTotal) * 100) : 0,
  };
}

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function mergeRecord(target, source) {
  if (!isRecord(source)) return target;
  return { ...target, ...source };
}

export class ProgressStore {
  constructor(catalog, options = {}) {
    const entries = Array.isArray(catalog) ? catalog : [];
    this.catalog = entries.map((entry) => (typeof entry === "string" ? { id: entry, variations: [] } : entry));
    this.openingIds = this.catalog.map((opening) => opening.id).filter(Boolean);
    this.openingsById = new Map(this.catalog.map((opening) => [opening.id, opening]));
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
    this.clock = typeof options.now === "function" ? options.now : () => new Date();
    this.listeners = new Set();
    this.startupWarning = null;
    this.lastPersistenceError = null;
    this.lastImportReport = null;
    this.data = this.load();
  }

  now() {
    const supplied = this.clock();
    const date = supplied instanceof Date ? new Date(supplied.getTime()) : new Date(supplied);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(detail) {
    this.listeners.forEach((listener) => listener(detail));
  }

  canonicalLineKey(openingId, lineKey = "main") {
    if (lineKey === "main") return "main";
    const opening = this.openingsById.get(openingId);
    if (!opening) return null;
    const variations = Array.isArray(opening.variations) ? opening.variations : [];
    const direct = variations.find((variation) => variation.id === lineKey);
    if (direct) return direct.id;
    if (/^\d+$/.test(String(lineKey))) {
      const legacy = variations[Number(lineKey)];
      return legacy?.id || (legacy ? String(lineKey) : null);
    }
    return null;
  }

  preserveRecovery(raw, reason) {
    if (!this.storage || typeof raw !== "string") return false;
    try {
      let records = [];
      const existing = this.storage.getItem(RECOVERY_STORAGE_KEY);
      if (existing) {
        try {
          const parsed = JSON.parse(existing);
          if (Array.isArray(parsed?.records)) records = parsed.records;
          else records = [{ capturedAt: null, reason: "Earlier recovery copy", raw: existing }];
        } catch {
          records = [{ capturedAt: null, reason: "Earlier recovery copy", raw: existing }];
        }
      }
      records.unshift({ capturedAt: this.now().toISOString(), reason, raw });
      this.storage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify({ records: records.slice(0, 3) }));
      return true;
    } catch {
      return false;
    }
  }

  load() {
    if (!this.storage) {
      this.startupWarning = "Progress works for this session, but this browser is not allowing local storage.";
      return this.normalizeData({});
    }

    let raw = "";
    try {
      raw = this.storage.getItem(STORAGE_KEY) || "";
    } catch {
      this.startupWarning = "OpeningLab could not read local progress. Existing browser data was left untouched.";
      return this.normalizeData({});
    }
    if (!raw) return this.normalizeData({});

    let saved;
    try {
      saved = JSON.parse(raw);
    } catch {
      const preserved = this.preserveRecovery(raw, "Invalid JSON in local progress");
      this.startupWarning = preserved
        ? "Damaged local progress was preserved as a recovery copy; OpeningLab started with safe defaults."
        : "Local progress is damaged and could not be read. OpeningLab did not intentionally delete the original value.";
      return this.normalizeData({});
    }

    try {
      const report = this.normalizeWithReport(saved);
      if (report.warnings.length) {
        this.startupWarning = `${report.warnings.length} outdated or unknown progress item${report.warnings.length === 1 ? " was" : "s were"} normalized safely.`;
      }
      return report.data;
    } catch (error) {
      const preserved = this.preserveRecovery(raw, error?.message || "Unsupported local progress");
      this.startupWarning = preserved
        ? `${error.message} The original data was preserved as a recovery copy.`
        : `${error.message} The existing browser value was left untouched.`;
      return this.normalizeData({});
    }
  }

  normalizeWithReport(saved = {}) {
    if (!isRecord(saved)) throw new Error("OpeningLab progress must be a JSON object.");
    const warnings = [];
    const sourceVersion = saved.version === undefined ? 1 : wholeCount(saved.version);
    if (sourceVersion > STORAGE_VERSION) {
      throw new Error(`This progress was created by a newer unsupported storage version (${sourceVersion}).`);
    }

    const sourceOpenings = isRecord(saved.openings)
      ? saved.openings
      : isRecord(saved.progress)
        ? saved.progress
        : {};
    if (!isRecord(saved.openings) && isRecord(saved.progress)) {
      warnings.push("Legacy progress map migrated to the current format.");
    }

    const openings = Object.fromEntries(
      this.openingIds.map((id) => [id, normalizeOpening(sourceOpenings[id], warnings, id)]),
    );

    const archivedSource = isRecord(saved.archived) ? saved.archived : {};
    const archived = {
      openings: mergeRecord({}, archivedSource.openings),
      lineReviews: mergeRecord({}, archivedSource.lineReviews),
      openingFields: mergeRecord({}, archivedSource.openingFields),
      topLevel: mergeRecord({}, archivedSource.topLevel),
    };

    Object.entries(sourceOpenings).forEach(([id, value]) => {
      if (!this.openingIds.includes(id)) {
        archived.openings[id] = value;
        warnings.push(`Unknown opening "${id}" was preserved in archived data.`);
        return;
      }
      if (!isRecord(value)) return;
      const extras = Object.fromEntries(Object.entries(value).filter(([key]) => !KNOWN_OPENING_FIELDS.has(key)));
      if (Object.keys(extras).length) {
        archived.openingFields[id] = mergeRecord(archived.openingFields[id] || {}, extras);
        warnings.push(`Unknown fields for "${id}" were preserved in archived data.`);
      }
    });

    Object.entries(saved).forEach(([key, value]) => {
      if (!KNOWN_DATA_FIELDS.has(key)) archived.topLevel[key] = value;
    });

    const lineReviews = {};
    Object.entries(isRecord(saved.lineReviews) ? saved.lineReviews : {}).forEach(([key, value]) => {
      const separator = key.indexOf(":");
      const openingId = separator > 0 ? key.slice(0, separator) : "";
      const sourceLineKey = separator > 0 ? key.slice(separator + 1) : "";
      const canonical = this.canonicalLineKey(openingId, sourceLineKey);
      if (!this.openingIds.includes(openingId) || !canonical) {
        archived.lineReviews[key] = value;
        warnings.push(`Unknown review line "${key}" was preserved in archived data.`);
        return;
      }
      const normalizedKey = `${openingId}:${canonical}`;
      lineReviews[normalizedKey] = normalizeLineReview(value);
      if (sourceLineKey !== canonical) warnings.push(`Review line "${key}" migrated to "${normalizedKey}".`);
    });

    const sourceFavorites = Array.isArray(saved.favorites)
      ? saved.favorites
      : Array.isArray(saved.favoriteIds)
        ? saved.favoriteIds
        : [];
    const lastOpeningCandidate = saved.lastOpening ?? saved.lastOpeningId;

    return {
      data: {
        version: STORAGE_VERSION,
        openings,
        lastOpening: this.openingIds.includes(lastOpeningCandidate) ? lastOpeningCandidate : null,
        studyStarted: safeDate(saved.studyStarted),
        favorites: [...new Set(sourceFavorites)].filter((id) => this.openingIds.includes(id)),
        lineReviews,
        archived,
      },
      warnings,
      migratedFrom: sourceVersion,
    };
  }

  normalizeData(saved = {}) {
    return this.normalizeWithReport(saved).data;
  }

  persistData(data) {
    if (!this.storage) return false;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
      this.lastPersistenceError = null;
      return true;
    } catch {
      this.lastPersistenceError = "This browser would not allow OpeningLab to save local progress.";
      return false;
    }
  }

  save(type = "save") {
    const saved = this.persistData(this.data);
    this.notify({ type, saved, data: this.data });
    return saved;
  }

  reload() {
    this.data = this.load();
    this.notify({ type: "reload", saved: true, data: this.data });
    return this.data;
  }

  getStartupWarning() {
    return this.startupWarning;
  }

  getPersistenceError() {
    return this.lastPersistenceError;
  }

  hasRecovery() {
    if (!this.storage) return false;
    try {
      return Boolean(this.storage.getItem(RECOVERY_STORAGE_KEY));
    } catch {
      return false;
    }
  }

  exportRecoveryJSON() {
    if (!this.storage) return null;
    try {
      return this.storage.getItem(RECOVERY_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  get(id) {
    return this.data.openings[id] || emptyOpeningProgress();
  }

  update(id, patch) {
    if (!this.openingIds.includes(id)) return emptyOpeningProgress();
    if (!this.data.openings[id]) this.data.openings[id] = emptyOpeningProgress();
    const next = {
      ...this.data.openings[id],
      ...patch,
      lastStudied: this.now().toISOString(),
    };
    this.data.openings[id] = normalizeOpening(next);
    this.data.lastOpening = id;
    if (!this.data.studyStarted) this.data.studyStarted = this.now().toISOString();
    this.save("progress");
    return this.data.openings[id];
  }

  markVisited(id) {
    return this.update(id, { visited: true });
  }

  completeLesson(id) {
    return this.update(id, { lessonComplete: true, visited: true });
  }

  completePractice(id) {
    const current = this.get(id);
    return this.update(id, {
      practiceComplete: true,
      practiceAttempts: current.practiceAttempts + 1,
      visited: true,
    });
  }

  recordPracticeAttempt(id) {
    const current = this.get(id);
    return this.update(id, {
      practiceAttempts: current.practiceAttempts + 1,
      visited: true,
    });
  }

  reviewKey(openingId, lineKey = "main") {
    const canonical = this.canonicalLineKey(openingId, lineKey) || lineKey;
    return `${openingId}:${canonical}`;
  }

  getLineReview(openingId, lineKey = "main") {
    return this.data.lineReviews[this.reviewKey(openingId, lineKey)] || null;
  }

  recordLineReview(openingId, lineKey, result = {}) {
    const canonical = this.canonicalLineKey(openingId, lineKey);
    if (!canonical) return null;
    const key = this.reviewKey(openingId, canonical);
    const previous = normalizeLineReview(this.data.lineReviews[key]);
    const attempts = previous.attempts + 1;
    const completed = Boolean(result.completed);
    const totalMoves = Math.max(1, Number(result.totalMoves) || 1);
    const penalties = (Number(result.mistakes) || 0) + (Number(result.hints) || 0) * 0.75;
    const attemptAccuracy = completed ? Math.round(clamp((1 - penalties / totalMoves) * 100, 0, 100)) : 0;
    const accuracy = Math.round((previous.accuracy * previous.attempts + attemptAccuracy) / attempts);
    const clean = completed && attemptAccuracy >= 95;
    const intervalSteps = [1, 3, 7, 14, 30, 60];
    let intervalDays = 0.25;

    if (clean) {
      intervalDays = intervalSteps.find((days) => days > previous.intervalDays) || 60;
    } else if (completed && attemptAccuracy >= 70) {
      intervalDays = 1;
    }

    const currentStreak = clean ? previous.currentStreak + 1 : 0;
    const now = this.now();
    this.data.lineReviews[key] = {
      attempts,
      completions: previous.completions + (completed ? 1 : 0),
      accuracy,
      intervalDays,
      currentStreak,
      bestStreak: Math.max(previous.bestStreak, currentStreak),
      lapses: previous.lapses + (clean ? 0 : 1),
      lastReviewed: now.toISOString(),
      nextReview: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
    };
    this.save("review");
    return this.data.lineReviews[key];
  }

  isFavorite(id) {
    return this.data.favorites.includes(id);
  }

  toggleFavorite(id) {
    if (!this.openingIds.includes(id)) return false;
    const favorites = new Set(this.data.favorites);
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    this.data.favorites = [...favorites].filter((openingId) => this.openingIds.includes(openingId));
    this.save("favorite");
    return favorites.has(id);
  }

  setNote(id, note) {
    if (!this.data.openings[id]) return { note: "", saved: false };
    const normalized = typeof note === "string" ? note.slice(0, 2000) : "";
    this.data.openings[id] = normalizeOpening({
      ...this.data.openings[id],
      note: normalized,
      visited: true,
      lastStudied: this.now().toISOString(),
    });
    this.data.lastOpening = id;
    if (!this.data.studyStarted) this.data.studyStarted = this.now().toISOString();
    return { note: normalized, saved: this.save("note") };
  }

  lastOpeningId() {
    return this.openingIds.includes(this.data.lastOpening) ? this.data.lastOpening : null;
  }

  reviewQueue(openings, limit = 12) {
    const now = this.now().getTime();
    const entries = openings.flatMap((opening, openingIndex) => {
      const progress = this.get(opening.id);
      const favorite = this.isFavorite(opening.id);
      const lines = [
        { lineKey: "main", line: opening.mainLine },
        ...opening.variations.map((variation, index) => ({ lineKey: variation.id || String(index), line: variation })),
      ];
      return lines.map(({ lineKey, line }, lineIndex) => {
        const review = this.getLineReview(opening.id, lineKey);
        const dueAt = review?.nextReview ? new Date(review.nextReview).getTime() : null;
        const due = Boolean(review && dueAt <= now);
        const weak = Boolean(review && review.accuracy < 80);
        const category = due ? 0 : weak ? 1 : !review && (progress.visited || favorite) ? 2 : !review ? 3 : 4;
        const timeRank = review && dueAt
          ? Math.max(-500_000, Math.min(500_000, Math.round((dueAt - now) / 60_000)))
          : lineIndex * openings.length + openingIndex;
        return {
          opening,
          line,
          lineKey,
          review,
          due,
          weak,
          favorite,
          score: category * 1_000_000 + (favorite ? -100_000 : 0) + timeRank,
        };
      });
    });

    return entries.sort((a, b) => a.score - b.score).slice(0, limit);
  }

  reviewSummary(openings) {
    const now = this.now().getTime();
    const reviews = Object.values(this.data.lineReviews);
    const due = reviews.filter((review) => review.nextReview && new Date(review.nextReview).getTime() <= now).length;
    const strong = reviews.filter((review) => review.accuracy >= 90 && review.completions > 0).length;
    const average = reviews.length
      ? Math.round(reviews.reduce((sum, review) => sum + review.accuracy, 0) / reviews.length)
      : 0;
    return {
      due,
      strong,
      average,
      reviewed: reviews.length,
      totalLines: openings.reduce((sum, opening) => sum + opening.variations.length + 1, 0),
    };
  }

  exportJSON() {
    return JSON.stringify(
      {
        app: "OpeningLab",
        formatVersion: 1,
        storageVersion: STORAGE_VERSION,
        exportedAt: this.now().toISOString(),
        data: this.data,
      },
      null,
      2,
    );
  }

  importJSON(source) {
    if (typeof source === "string" && new TextEncoder().encode(source).length > MAX_IMPORT_BYTES) {
      throw new Error("That backup is larger than OpeningLab's 5 MB safety limit. Current progress was not changed.");
    }

    let parsed;
    try {
      parsed = typeof source === "string" ? JSON.parse(source) : source;
    } catch {
      throw new Error("That file is not valid JSON. Current progress was not changed.");
    }
    if (parsed?.app && parsed.app !== "OpeningLab") {
      throw new Error("That JSON file was not created by OpeningLab. Current progress was not changed.");
    }
    const incoming = parsed?.data || parsed;
    if (!isRecord(incoming) || (!isRecord(incoming.openings) && !isRecord(incoming.progress))) {
      throw new Error("This is not an OpeningLab progress file. Current progress was not changed.");
    }

    const report = this.normalizeWithReport(incoming);
    if (!this.persistData(report.data)) {
      throw new Error("Progress was read, but this browser would not allow it to be saved. Current progress was not changed.");
    }
    this.data = report.data;
    this.lastImportReport = {
      warnings: report.warnings,
      migratedFrom: report.migratedFrom,
    };
    this.notify({ type: "import", saved: true, data: this.data, report: this.lastImportReport });
    return this.lastImportReport;
  }

  recordQuiz(id, correct, total) {
    const current = this.get(id);
    const result = calculateQuizScore(correct, total);
    return this.update(id, {
      quizAttempts: current.quizAttempts + 1,
      quizCorrect: current.quizCorrect + result.correct,
      quizAnswered: current.quizAnswered + result.total,
      bestQuizScore: Math.max(current.bestQuizScore, result.percent),
      visited: true,
    });
  }

  openingPercent(id) {
    const progress = this.get(id);
    if (progress.mastered) return 100;
    const lesson = progress.lessonComplete ? 35 : progress.visited ? 10 : 0;
    const practice = progress.practiceComplete ? 35 : 0;
    const quiz = Math.round(Math.min(progress.bestQuizScore, 100) * 0.3);
    return Math.min(100, lesson + practice + quiz);
  }

  stats() {
    const values = this.openingIds.map((id) => this.get(id));
    const mastered = values.filter((value) => value.mastered).length;
    const learned = values.filter((value) => value.lessonComplete).length;
    const practiceComplete = values.filter((value) => value.practiceComplete).length;
    const modulesComplete = learned + practiceComplete + values.filter((value) => value.bestQuizScore >= 80).length;
    const quizCorrect = values.reduce((sum, value) => sum + value.quizCorrect, 0);
    const quizAnswered = values.reduce((sum, value) => sum + value.quizAnswered, 0);
    const quizAccuracy = quizAnswered ? Math.round((quizCorrect / quizAnswered) * 100) : 0;
    const totalPercent = this.openingIds.length
      ? Math.round(
          this.openingIds.reduce((sum, id) => sum + this.openingPercent(id), 0) /
            this.openingIds.length,
        )
      : 0;

    return {
      mastered,
      learned,
      practiceComplete,
      modulesComplete,
      quizAccuracy,
      quizAnswered,
      totalPercent,
    };
  }

  reset() {
    let saved = true;
    if (this.storage) {
      try {
        this.storage.removeItem(STORAGE_KEY);
      } catch {
        saved = false;
      }
    } else {
      saved = false;
    }
    this.data = this.normalizeData({});
    this.notify({ type: "reset", saved, data: this.data });
    return this.data;
  }
}
