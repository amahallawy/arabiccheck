# AgDR-0006: Checker adapters, the worker protocol, source resolution between packages, and real-model tests in CI

**Status**: Proposed · **Date**: 2026-11-24 · **Decided by**: Claude, plan approved by the owner before the build (the tinyfix mode is the owner's call) · **Issue**: #7

## Context

Story 3 (#7) wraps tinyfix and tinyfix-ar (AgDR-0002) and runs both in one
Web Worker. Building it needs choices AgDR-0002 left open:

1. Packages now import each other (`checker-en` → `core`, `worker` → all).
   `@arabiccheck/core` exports only its built `dist/`, so a clean checkout
   can't typecheck or test a dependent package before building (deferred
   from #5).
2. The issue's acceptance tests run the **real** models. Both packages load
   their files with the global `fetch(base + file)`; Node's `fetch` can't
   read `file:` URLs. AgDR-0004 feared `onnxruntime-web` might not run in
   Node at all.
3. tinyfix has two strictness modes, `balanced` (its published numbers) and
   `careful` (fewer wrong changes, fewer fixes).
4. How the page talks to the worker: stale replies, load failures, and two
   ONNX sessions that must not run concurrently.

A spike on 2026-11-24 ran both packages' real models under plain Node 24 with
`onnxruntime-web` 1.31.1, files served over a local HTTP server: tinyfix
loads in ~0.7 s, tinyfix-ar in ~0.25 s, checks take ~40 ms, and both name the
missing file when a load fails. No fallback runtime is needed.

## Options

| Choice | Options | Picked |
|---|---|---|
| Source between packages | Build before typecheck/test; TS project references (`tsc -b`); path aliases in every tool; **a package export condition for source** | Export condition |
| Real-model tests | Mock the packages; headless browser; **Node with a local HTTP server serving the fetched files** | Node + local server |
| Models in CI | Commit them; skip model tests in CI; **download in CI, cached by the lock's hash** | Download + cache |
| tinyfix mode | `balanced`; **`careful`** (owner's decision) | `careful` |
| Where the worker lives | Inside the playground app; **its own package** (`packages/worker`) | Own package |

## Decision

- **Export condition `@arabiccheck/source`.** Each package's `exports` maps
  this condition to `src/index.ts` ahead of `dist/`. TypeScript reads it via
  `customConditions` in `tsconfig.base.json`; Vitest (and Vite in #8) via
  `resolve.conditions`. Builds turn it off (`customConditions: []` in each
  `tsconfig.build.json`) and resolve to `dist/`, so the root `build` script
  builds in dependency order: core, then the checkers, then the worker, then
  the playground. Node at runtime never sees the condition, so the published
  shape stays `dist/`.
- **Adapters** (`packages/checker-en`, `packages/checker-ar`) are the only
  importers of tinyfix and tinyfix-ar, and return core `Suggestion`s:
  - English: `context` → `real-word`, `confidence` → score; mode `careful`.
  - Arabic: changes come from `fix()` (what its thresholds are calibrated
    for); `judge()` runs after it on the same text, and its entry with the
    same span gives `detail` (the edit kind) and `kind` (`spelling` when the
    typed word is a known misspelling, else `real-word`). The two calls run
    one after the other, never at once, on the one ONNX session.
- **Worker protocol** (`packages/worker`): the page sends `init` (model and
  runtime URLs, so the M1 extension can point elsewhere), then `check`
  messages with an increasing `version`. The worker loads each language
  independently; a failed load posts `load-error` with the file name and
  disables that language only. Checks run one at a time; a queued check that
  a newer one has overtaken is skipped. The page-side client resolves a
  superseded check with `undefined` and ignores any reply for it.
- **Real-model tests** run in Vitest under Node against a local HTTP server
  that serves `apps/playground/public/models/`. They fail with a clear
  message if the models aren't downloaded; they are never skipped silently.
  CI caches the models by `hashFiles('models.lock.json')` and runs
  `npm run fetch-models`, which re-verifies every cached file's hash.

## Consequences

- Dependent packages typecheck and test from a clean checkout without a build.
- Masking costs some context: the Arabic model reads the words on either side
  of an English word as neighbours, with only spaces between. The design
  accepts this for M0; mixed-text cases in the evaluation (#10) measure it.
- One client per worker: the worker answers only the newest version it has
  seen, so a second client starting again at version 1 would be ignored.
- Every PR runs the issue's real sentences on the real models, so a model or
  adapter regression shows up in CI, at the cost of an ~18 MB download on a
  cache miss.
- `careful` may miss some errors `balanced` would fix; #10 measures both
  modes so the choice can be revisited with numbers.
