# Security policy

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/avds2/openinglab/security/advisories/new) so details are not published before a fix is available. Include the affected browser, deployment URL or commit, reproduction steps, impact, and any suggested mitigation.

Do not include private study notes, exported progress files, access tokens, or other personal data in a public issue. For ordinary non-sensitive bugs, use the repository issue tracker.

## Security model

OpeningLab is a static, client-side application. It has no application backend, account system, database, analytics endpoint, advertising SDK, or remote chess service. All curriculum and application code are served as same-origin static files and can be cached by the service worker for offline use.

The application intentionally:

- loads no third-party JavaScript, fonts, images, or runtime APIs;
- escapes curriculum and user-authored text before inserting it into generated markup;
- limits imported progress backups to 5 MB and validates/normalizes them before replacing current progress;
- preserves unknown or damaged local data in a recovery record when possible;
- keeps a waiting service worker inactive until the user accepts an update, avoiding mixed application versions;
- derives the offline cache name from versioned application content.

## Data stored locally

OpeningLab may store the following in the browser profile:

- lesson, practice, quiz, and mastery progress;
- spaced-review attempts, accuracy, streaks, and due dates;
- favorites and the last opening studied;
- private per-opening notes;
- the explicit light/dark theme choice;
- up to three recovery copies when saved progress cannot be parsed safely.

An exported backup contains this learning data and any private notes in plain JSON. Treat exported files as personal data and store or share them accordingly.

## Data not collected

OpeningLab does not transmit learning activity, notes, progress, identifiers, device information, or analytics to an OpeningLab server. There is no OpeningLab server. Normal web hosting may still receive standard HTTP request metadata such as an IP address and user agent; that is controlled by the chosen host, not by application code.

## Trust boundaries and limitations

- Anyone with access to the same unlocked browser profile may be able to read local OpeningLab data.
- Browser storage and exported backups are not encrypted by OpeningLab.
- Clearing site data removes local progress unless a backup was exported.
- The hosting provider and repository maintainers can publish new client code. Review deployment provenance when this matters to your threat model.
- OpeningLab validates its predetermined curriculum moves; it is not a general-purpose legal-move engine or anti-cheat system.

Supported security fixes target current stable versions of Chrome, Chromium Edge, Firefox, and Safari.
