# Releasing OpeningLab

OpeningLab releases stay intentionally small: one application version, one reviewed curriculum baseline, one generated service worker, and one deployable static directory.

1. Update `package.json`, `js/version.js`, and `CHANGELOG.md` to the same semantic version.
2. If curriculum changed intentionally, inspect the validation report and run `npm run curriculum:baseline`; review the resulting count and digest diff.
3. Run `npm run sw:generate` after all runtime changes.
4. Run `npm ci`, install Chromium once with `npx playwright install chromium`, and run `npm run validate`.
5. Inspect `dist/` on desktop and phone viewports, including an offline reload.
6. Merge only after CI succeeds. The Pages deployment job is blocked on the same validation command.
7. Tag the validated commit as `v<version>` and use the matching `CHANGELOG.md` section as release notes.

The service-worker cache name includes both the release version and a digest of every precached runtime asset. A content change therefore cannot reuse an old app-shell cache accidentally. The waiting worker activates only after the user accepts the in-app update prompt (or all older tabs close), which avoids swapping code underneath an active study session.
