# Contributing to OpeningLab

OpeningLab favors small, reviewable changes and a quiet runtime: no account system, no backend, no tracking, and no runtime framework. Development tooling is welcome when it protects those constraints without shipping extra code to users.

## Local development

Requirements:

- Node.js 22 or newer for validation and builds
- A current browser

Install development tools and run the complete health check:

```bash
npm ci
npm run validate
```

Serve the source directory during UI work:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`. A real local HTTP origin is required for ES modules and service workers; opening `index.html` with `file://` is unsupported.

## Repository structure

| Path | Responsibility |
|---|---|
| `index.html` | Static shell, primary navigation, dialogs, update notice, metadata |
| `css/styles.css` | Shared tokens plus context-specific Learn, Lesson, Practice, Quiz, Review, and Progress styles |
| `js/app.js` | Hash routing, global UI state, Learn library, theme ownership, import/export UI |
| `js/board.js` | Deterministic position model and accessible board interaction |
| `js/lesson.js` | Lesson tabs, explanations, notation, playback, notes |
| `js/practice.js` | Guided, Recall, and Sprint state machine |
| `js/quiz.js` | Quiz interaction, answer feedback, results, retry flow |
| `js/storage.js` | Progress, mastery, review scheduling, persistence, migrations, backups |
| `js/openings/` | Curriculum sources, schema helpers, normalization, explanations |
| `scripts/` | Validation, build, reporting, and generated service-worker tooling |
| `tests/` | Unit, integration, browser, accessibility, and PWA regression coverage |
| `docs/INVARIANTS.md` | Non-negotiable data and architecture relationships |

## Adding an opening

1. Add the record to the appropriate curriculum source in `js/openings/` using constructors from `schema.js`.
2. Choose a unique lowercase kebab-case opening ID. Treat it as permanent once released.
3. Supply all required teaching fields, one main line, at least five important variations, and at least five quiz questions.
4. Give every move valid coordinates, numbered SAN display text, and an explanation of purpose.
5. Give every variation a stable ID when its generated name-based ID would be unclear or likely to change.
6. Run `npm run validate:curriculum`, inspect the reported counts, and update the curriculum baseline intentionally.

## Adding a variation or question

- Variation IDs must remain unique and stable within the opening.
- Lines replay from the normal starting position. They may branch before the opening's displayed main sequence.
- A quiz answer is a zero-based index into `choices`.
- Optional `lineId` and `ply` references must resolve to existing curriculum entities.
- Do not use placeholder explanations such as “develops” or “takes.” Explain the strategic, tactical, structural, or developmental purpose.

## Validation and tests

Use the canonical command before every pull request:

```bash
npm run validate
```

Focused commands are available for unit tests, curriculum validation, linting, browser tests, accessibility, performance budgets, and service-worker checks. See `npm run` for the current list.

If a runtime asset changes, regenerate the committed development worker:

```bash
npm run sw:generate
```

The production build always generates its own content-hashed worker:

```bash
npm run build
```

## Deployment

GitHub Actions runs the same quality gates on pushes and pull requests. The Pages deployment job runs only after validation succeeds and publishes `dist/`, never development dependencies or test artifacts.

## Pull requests

- Keep unrelated changes separate.
- Describe user-visible behavior and any persistence/curriculum implications.
- Add or update regression coverage for behavior changes.
- Do not weaken a validation rule merely to make malformed data pass; fix the data or explain and document a deliberate invariant change.
