# Markdown Conversion Tests

Fixtures live under `fixtures/<name>/presentation.md`.

Each fixture stores generated reference output in:

- `reference/reveal.md` for the simplified markdown passed into Reveal.js markdown
- `reference/handout.html` for the rendered handout HTML

Commands:

- `npm run tests` compares current output to stored references
- `npm run tests:generate` regenerates stored references from the current implementation

If a comparison fails, actual output is written to `tests/_actual/<name>/`.
