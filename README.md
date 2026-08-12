# OpeningLab

<p align="center">
  <img src="./assets/app-icon.svg" width="88" height="88" alt="OpeningLab knight logo" />
</p>

<p align="center">
  A free, private, no-sign-up chess-opening course with guided lessons, board practice, adaptive review, quizzes, and local progress tracking.
</p>

## Why OpeningLab?

OpeningLab is designed as a lightweight, privacy-friendly alternative to account-based chess repertoire trainers. It teaches the purpose behind each move instead of presenting unexplained notation.

- Free to use
- No account or email address
- No analytics, advertising, or tracking scripts
- No backend, database, chess engine, or external API
- Progress remains in the browser and can be exported as JSON
- Works offline after the first successful visit
- Runs on any ordinary static web server
- Built entirely with HTML, CSS, and vanilla JavaScript

## Course contents

- 20 complete opening courses
- 20 main instructional lines
- 116 important variations
- 1,552 explained half-moves
- 100 multiple-choice questions
- White- and Black-side training
- Guided, Recall, and 60-second Sprint practice modes
- Adaptive spaced-review queue
- Favorites and continue-learning flow
- Consistent local Font Awesome Chess piece set across boards and cards
- Private per-opening study notes included in exported backups
- Copyable move lines and move-purpose theme labels
- Quiz keyboard shortcuts (`1`–`4` or `A`–`D`)
- Local mastery and progress dashboard

### Included openings

| # | Opening | Repertoire | Starting moves |
|---:|---|---|---|
| 1 | Italian Game | White | `1.e4 e5 2.Nf3 Nc6 3.Bc4` |
| 2 | Ruy López | White | `1.e4 e5 2.Nf3 Nc6 3.Bb5` |
| 3 | Sicilian Defense | Black | `1.e4 c5` |
| 4 | French Defense | Black | `1.e4 e6 2.d4 d5` |
| 5 | Caro-Kann Defense | Black | `1.e4 c6 2.d4 d5` |
| 6 | Scotch Game | White | `1.e4 e5 2.Nf3 Nc6 3.d4` |
| 7 | Queen’s Gambit | White | `1.d4 d5 2.c4` |
| 8 | Slav Defense | Black | `1.d4 d5 2.c4 c6` |
| 9 | King’s Indian Defense | Black | `1.d4 Nf6 2.c4 g6 3.Nc3 Bg7` |
| 10 | English Opening | White | `1.c4` |
| 11 | Vienna Game | White | `1.e4 e5 2.Nc3` |
| 12 | King’s Gambit | White | `1.e4 e5 2.f4` |
| 13 | Scandinavian Defense | Black | `1.e4 d5` |
| 14 | Pirc Defense | Black | `1.e4 d6 2.d4 Nf6 3.Nc3 g6` |
| 15 | Alekhine Defense | Black | `1.e4 Nf6` |
| 16 | Nimzo-Indian Defense | Black | `1.d4 Nf6 2.c4 e6 3.Nc3 Bb4` |
| 17 | Grünfeld Defense | Black | `1.d4 Nf6 2.c4 g6 3.Nc3 d5` |
| 18 | Dutch Defense | Black | `1.d4 f5` |
| 19 | London System | White | `1.d4 d5 2.Nf3 Nf6 3.Bf4` |
| 20 | Catalan Opening | White | `1.d4 Nf6 2.c4 e6 3.g3` |

## Learning flow

Each course follows the same progression:

1. **Learn** — understand the opening, objectives, plans, structures, and common mistakes.
2. **Explore moves** — play the main line or an important variation forward and backward with a synchronized explanation for every move.
3. **Practice** — reproduce the line on the board while the opponent replies automatically.
4. **Review** — use Guided, Recall, or Sprint repetitions with adaptive scheduling.
5. **Quiz** — test move recognition, strategy, structures, and mistakes.
6. **Master** — complete the lesson and practice, then score at least 80% in the quiz.

OpeningLab is an opening trainer, not a general chess engine. Practice validates the predetermined educational repertoire, which keeps the application small, deterministic, and reliable.

## Run locally

The shipped application has no runtime dependencies or compilation step. Download or clone the repository, then serve its directory with any static server.

### Python

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

### PHP development server

```bash
php -S 127.0.0.1:8080
```

Opening `index.html` directly with a `file://` URL is not recommended because browser security rules can block JavaScript modules and the service worker.

Contributors use Node.js 22 or newer for the validation toolchain:

```bash
npm ci
npx playwright install chromium
npm run validate
```

`npm run validate` is the canonical “healthy and ready to deploy” check. It runs syntax and static checks, linting, release consistency, curriculum validation and integrity reporting, unit tests, service-worker verification, the production build, performance budgets, browser flows, offline tests, and automated accessibility scans.

### Module responsibilities

| File | Responsibility |
|---|---|
| `js/app.js` | Hash routing, navigation, library rendering, themes, and global view state |
| `js/board.js` | Board model, incremental rendering, position playback, orientation, interaction, move animation, and square highlights |
| `js/openings/` | Opening metadata, explained lines, stable IDs, variations, quiz content, and normalization |
| `js/lesson.js` | Lesson tabs, notation, move playback, explanations, and key squares |
| `js/practice.js` | Expected-move validation, automatic replies, hints, recall, and sprint modes |
| `js/quiz.js` | Question rendering, answer feedback, scoring, and retry flow |
| `js/storage.js` | Local progress, review scheduling, favorites, private notes, import/export, and reset |
| `js/pieces.js` | Locally bundled Font Awesome Free chess-piece set |
| `js/pwa.js` | Service-worker registration, update prompts, and lifecycle checks |
| `sw.template.js` / `sw.js` | Offline strategy template and generated content-versioned worker |
| `scripts/` | Curriculum, release, service-worker, static, and performance validation plus production builds |
| `tests/` | Board, progress, migration, curriculum, browser-flow, accessibility, and PWA coverage |

## Adding an opening or variation

Educational content is data-driven. A move uses a structured record:

```js
{
  from: "e2",
  to: "e4",
  san: "1. e4",
  explanation: "White claims central space and opens lines for the queen and bishop."
}
```

To expand the curriculum:

1. Add or extend an opening object in the appropriate source under `js/openings/`.
2. Give every move a valid origin, destination, SAN label, and educational explanation.
3. Add at least five important variations and five unambiguous quiz questions, using stable line IDs.
4. Run `npm run validate:curriculum` and inspect the reported relationships and counts.
5. If the change is intentional, update the reviewed integrity baseline with `npm run curriculum:baseline`.
6. Run `npm run sw:generate` and then the complete `npm run validate` gate.

The rendering, lesson, practice, review, quiz, and progress systems consume the same structured opening objects; no opening-specific UI needs to be created.

## Privacy and data

OpeningLab makes no network request for user data. The browser stores only local learning state such as completed lessons, practice results, review scheduling, favorites, quiz scores, and theme preference.

Users can export a JSON backup from the Progress view and restore it on another browser. Clearing site data removes local progress unless a backup was exported first.

## Performance and offline behavior

- No runtime package manager or framework
- No web fonts, image CDN, analytics, or third-party JavaScript
- A checked deploy-size, JavaScript, CSS, startup-resource, and DOM-size budget
- Native ES modules, SVG pieces, and CSS animations
- Incremental board updates that reuse all 64 square elements between moves
- Atomic app-shell installation and cache-first repeat loads for local static assets
- Content-derived cache identities, an explicit update prompt, and offline navigation recovery
- `prefers-reduced-motion` support

For reliable updates, `index.html`, `sw.js`, and `manifest.webmanifest` should be served with revalidation or no-cache headers. Versioned application assets can use longer browser caching.

## Development and releases

See [CONTRIBUTING.md](./CONTRIBUTING.md) for repository structure and curriculum workflow, [docs/INVARIANTS.md](./docs/INVARIANTS.md) for data relationships that must remain true, [docs/RELEASING.md](./docs/RELEASING.md) for the release process, and [SECURITY.md](./SECURITY.md) for the local-only security model. GitHub Actions blocks deployment until the canonical validation suite succeeds.

## Accessibility

- Semantic buttons and navigation
- Visible keyboard focus
- Text feedback in addition to color
- Algebraic coordinates and descriptive square labels
- Keyboard-accessible lesson tabs and move playback
- Comfortable touch targets and responsive bottom navigation
- Quiz answer shortcuts and roving keyboard focus on interactive boards
- Reduced-motion support

## Third-party artwork

The six chess-piece silhouettes are adapted from Font Awesome Free under
CC BY 4.0. No third-party asset is loaded at runtime.

## Browser support

OpeningLab targets current versions of Chrome, Chromium Edge, Firefox, and Safari. It requires ES modules, CSS Grid, `aspect-ratio`, and `localStorage`. Offline caching requires HTTPS or localhost.

## License

OpeningLab is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

The bundled Font Awesome chess-piece artwork is separately licensed under CC BY 4.0.
