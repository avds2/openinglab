# Opening course data format

OpeningLab curriculum records use schema version `1`. They are plain,
serializable JavaScript objects with the same predictable shape as JSON, but
they live in ES modules so shared move prefixes can be reused and the offline
app can start without additional fetch requests.

## Folder responsibilities

- `catalog.js` — the original ten opening courses.
- `additional.js` — the ten expanded-curriculum courses.
- `variations.js` — named variation lines shared into the original courses.
- `schema.js` — the only constructors used by course files.
- `explanations.js` — educational explanation enrichment.
- `index.js` — the public, normalized curriculum API consumed by the app.

Other app modules should import only from `./openings/index.js`.

## Opening record

```js
{
  id: "italian",
  name: "Italian Game",
  side: "White",
  difficulty: "Beginner",
  style: ["Tactical", "Classical"],
  startingMoves: "1.e4 e5 2.Nf3 Nc6 3.Bc4",
  character: "Open, active, and tactical",
  skillLevel: "Beginner to intermediate",
  glyph: "♗",
  intro: "...",
  objectives: ["..."],
  plans: { white: ["..."], black: ["..."] },
  keySquares: [{ square: "f7", label: "Early tactical target" }],
  pawnStructure: "...",
  mistakes: ["..."],
  memoryTip: "...",
  mainLine: { name: "...", moves: [] },
  variations: [{ name: "...", moves: [] }],
  quiz: []
}
```

## Move record

```js
defineMove(
  "e2",
  "e4",
  "1. e4",
  "White claims the center and opens lines for rapid development."
)
```

Every move requires a valid origin, destination, numbered SAN label, and an
educational explanation. The exported catalog enriches short explanations with
the move's strategic purpose, controlled squares, structural effect, or
development role.

## Adding opening 21

1. Add a new object to `additional.js` using the shared constructors from
   `schema.js`.
2. Use a unique lowercase kebab-case `id`.
3. Provide one main line, at least five important named variations, and five
   unambiguous quiz questions.
4. Explain every move; do not use placeholders such as “develops” or “takes.”
5. Run `npm test` from the repository root. The validator replays every line,
   checks the schema, and rejects incomplete explanations.
6. Increase `CACHE_NAME` in `sw.js` before publishing.
