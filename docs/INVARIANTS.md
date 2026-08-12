# OpeningLab development invariants

These rules define the relationships that application code, curriculum, persistence, and offline behavior rely on. `npm run validate` must stay green whenever one of these areas changes.

## Curriculum graph

### Openings

- `OPENINGS` is the single normalized curriculum entry point. UI modules import curriculum only from `js/openings/index.js`.
- Every opening has a globally unique, lowercase kebab-case `id`. An ID is persistent user-data identity and must not be renamed casually.
- `schemaVersion` equals `OPENING_SCHEMA_VERSION`.
- `side` is `White` or `Black`; `difficulty` is `Beginner`, `Intermediate`, or `Advanced`.
- Required educational fields are non-empty: name, starting sequence, character, skill level, introduction, objectives, plans for both colors, key squares, pawn structure, mistakes, and memory tip.
- Key-square coordinates are valid and unique within an opening.

### Lines and variations

- Every opening has exactly one `mainLine` whose ID is `main`.
- Every variation has a stable lowercase kebab-case `id`, unique within its opening. URLs and spaced-review records use this ID.
- A line name is unique within its opening. Duplicate main-line/variation names are invalid rather than silently discarded.
- A line starts from the normal chess starting position and alternates White/Black plies.
- Every move has valid `from` and `to` coordinates, numbered display SAN, and a substantive educational explanation.
- Replaying a line must always find the expected color's piece on the origin square, must not capture a friendly piece, and must follow the piece's movement geometry with clear sliding paths.
- Castling, en-passant capture, and promotion use the structured move metadata understood by `js/board.js`.
- The main line begins with the opening's documented `startingMoves`. Variations may diverge before that whole sequence.

### Quizzes

- Every opening has at least five questions.
- Each question has a type, prompt, two to six unique choices, a valid zero-based answer index, and an explanation.
- Optional `lineId` references must resolve within the same opening.
- Optional `ply` references must fall within the main line.
- Quiz scoring is `round(correct / total × 100)`, with malformed values clamped to safe whole-number bounds.

## Progress and mastery

- `ProgressStore` is the only source of truth for progress, favorites, notes, reviews, import/export, and mastery.
- Mastery is derived, never independently assigned: lesson complete + practice complete + best full-quiz score of at least 80%.
- Opening progress percentages are derived from the same normalized state.
- Review keys are `<opening-id>:<line-id>`. Numeric variation keys are legacy input only and migrate to stable IDs.
- Review intervals progress through 1, 3, 7, 14, 30, and 60 days after clean recall. Lower-quality or incomplete attempts shorten the next interval.

## Persistence and migrations

- The browser key remains `openinglab-progress-v1` for compatibility; the object inside it carries the current `STORAGE_VERSION`.
- All loaded and imported data passes through normalization. Never consume untrusted storage or import objects directly.
- A newer unsupported storage version is rejected without replacing current progress.
- Unknown opening IDs, review IDs, top-level fields, and per-opening fields are preserved under `data.archived` when practical.
- Invalid JSON never replaces current progress. Damaged local storage is copied to the recovery key before safe defaults are used when browser storage permits it.
- Imports are transactional: persistence must succeed before in-memory progress is replaced.
- Export → import must round-trip all supported progress, reviews, favorites, and notes.

## Offline and release behavior

- Runtime code remains static, same-origin, and backend-free.
- `scripts/lib/service-worker-build.mjs` discovers the app's module/resource graph and derives the cache name from its contents and the application version.
- `sw.js` is generated. Do not hand-edit its cache name or asset list; run `npm run sw:generate`.
- Service-worker installation is atomic. A failed precache deletes the incomplete new cache.
- A new worker waits until the user accepts the update; only then does it activate, remove older OpeningLab caches, and reload.
- `manifest.webmanifest` paths stay relative so root and subpath hosting both work.

## Architectural boundaries

- The shipped app uses HTML, CSS, and native ES modules with no runtime package dependencies.
- Development-only tools may be added only when they provide an explicit validation benefit.
- User text and curriculum text inserted through templates must be escaped.
- Changes must preserve keyboard, touch, reduced-motion, theme, import/export, and offline flows.
