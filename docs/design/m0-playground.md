# Tech Design: M0 — offline playground

**Spec**: [`docs/specs/m0-playground.md`](../specs/m0-playground.md) · **Parent issue**: #3
**Status**: Approved (PR #4, 2026-11-24)
**Decisions**: AgDR-0001 (repo tooling), AgDR-0002 (checker engines),
AgDR-0003 (model delivery), AgDR-0004 (evaluation), AgDR-0005 (scripts and
runtime delivery), AgDR-0006 (adapters, worker protocol, source resolution),
AgDR-0007 (playground page)

## Shape

```
arabiccheck/
  package.json              npm workspaces root (AgDR-0001)
  packages/
    core/                   types, language runs, masking, merging — no dependencies
    checker-en/             adapter over tinyfix 0.1.1 (AgDR-0002)
    checker-ar/             adapter over tinyfix-ar 1.0.0 (AgDR-0002)
    worker/                 worker protocol, handler, page-side client, worker entry (AgDR-0006)
  apps/playground/          Vite + plain TypeScript page, one Web Worker, a service worker
  models.lock.json          pinned model files: URL, size, SHA-256 (AgDR-0003)
  scripts/fetch-models.ts   downloads and verifies the locked files (AgDR-0005)
  eval/                     runner + test sets (AgDR-0004)
  NOTICE                    third-party models and word lists, with licences
```

## Data flow

```
textarea ──(debounce 250 ms, version n)──► worker.postMessage({ n, text })
                                              │
                    core.runs(text) ─► Arabic runs, Latin runs, neutral
                                              │
                 mask(text, "ar") ─► checker-ar.check() ─┐
                 mask(text, "en") ─► checker-en.check() ─┤
                                                         ▼
                                   core.merge(suggestions, ignored)
                                              │
page ◄── { n, suggestions, timings } ◄────────┘   (dropped if n is stale)
```

## Key pieces

### `core` (no dependencies, fully unit-tested)

```ts
type Lang = "ar" | "en";
interface Suggestion {
  start: number; end: number;          // UTF-16 offsets in the original text
  typed: string; replacement: string;
  lang: Lang;
  kind: "spelling" | "real-word";
  detail?: string;                     // Arabic edit kind: "hamza", "taa_marbuta", "typo", …
  score: number; scoreKind: "confidence" | "margin";
  checker: string;                     // "tinyfix@0.1.1", "tinyfix-ar@1.0.0"
}
interface Checker {
  id: string; lang: Lang;
  check(text: string): Promise<Suggestion[]>;
}
```

- **Language runs.** A character is Arabic if it is in the Arabic blocks
  (U+0600–06FF, 0750–077F, 0870–08FF, FB50–FDFF, FE70–FEFE), Latin if it is
  `A–Z a–z`, otherwise neutral. U+FEFF (the byte order mark) is neutral.
  Arabic-Indic digits are in the Arabic block, so they count as Arabic.
  Neutral characters join the run before them in reading order; neutral
  characters before any letter form a neutral run. No model is needed for
  two scripts this distinct. (Refined in #5: Arabic Extended-B, U+0870–089F,
  added; U+FEFF excluded; "on their left" made precise for RTL text.)
- **Masking** keeps offsets exact without any mapping: each checker gets a
  copy of the text in which every character of the *other* language is
  replaced by a space. The copy has the same length, so every span the
  checker returns is already a span in the original text.
- **Merging** sorts by start, removes overlaps (higher score wins), drops
  ignored words, and drops anything whose span no longer holds `typed`.
  Scores are compared only within one `scoreKind`: when suggestions with
  different score kinds (confidence vs margin) overlap, both are dropped,
  since their scores aren't comparable and a conflict isn't worth showing.
  Suggestions with a non-finite score are dropped too. (Refined in #5.)
- **Applying** a suggestion checks `text.slice(start, end) === typed` first;
  otherwise it does nothing (spec FR-003). Empty spans, and spans that split a
  surrogate pair, are never applied.

### Checker adapters

- **English** (`tinyfix`): `loadTinyfix({ baseUrl: "/models/en/", wasmPaths:
  "/ort/" })`, then `check()`. It already returns spans, kind (`spelling` or
  `context` → `real-word`) and a 0–1 confidence. It skips code, URLs and
  emails itself. Inside our worker there is no `document`, so it runs inline
  rather than spawning a second worker.
- **Arabic** (`tinyfix-ar`): `loadTinyfixAr({ baseUrl: "/models/ar/",
  wasmPaths: "/ort/" })`. `fix()` is the source of truth for changes (it is
  what the thresholds are calibrated for). `judge()` supplies the edit kind
  for `detail`. Kind is `spelling` when the typed word is a known
  misspelling, otherwise `real-word`. The score is the model's margin.
- Both use the same `onnxruntime-web` (1.31.x satisfies both packages'
  ranges), WebAssembly build only.

### Worker

One module worker hosts both checkers. Messages carry a version number; the
page ignores any reply older than the latest text it sent (spec edge case:
the user kept typing). Load errors are posted back with the failing file name.

### Model delivery (AgDR-0003)

- `models.lock.json` lists every file with its exact Hugging Face revision
  URL, size and SHA-256. Every URL pins a full commit hash, never a branch
  or tag (AgDR-0005). `npm run fetch-models` downloads into
  `apps/playground/public/models/{en,ar}/` (gitignored) and refuses any file
  whose hash differs.
- `onnxruntime-web`'s `.wasm` files are copied to `public/ort/` at build, so
  the runtime never loads from a CDN.
- A small hand-written service worker caches the page, scripts, `.wasm` and
  model files on first load, so a reload works with the network off.

### Playground UI

Plain TypeScript and CSS, no framework. Left (or top on narrow screens): a
textarea with `dir="auto"`. Right: the same text rendered with `<mark>` on
each suggestion, paragraph by paragraph with `dir="auto"`, and the list of
suggestions with accept, ignore and accept-all. A footer shows model load
time and the last check time. Inline underlines inside the text box are an
M1 (extension) problem, not M0's.

### Evaluation (AgDR-0004)

- Test sets are JSONL: `{ "id", "lang", "text", "expected", "source" }`.
  M0 checkers only substitute words, so `text` and `expected` have the same
  number of whitespace-separated tokens; the loader rejects a case that
  doesn't.
- For each token: error = `text ≠ expected`; changed = output ≠ text.
  Correct fix = changed and output = expected. **Precision** = correct fixes
  / changes. **Recall** = correct fixes / errors. **False alarms per 1,000**
  = changes on tokens that were already correct / correct tokens × 1,000.
- `npm run eval` runs in Node and prints a table per set, plus
  `eval/report.json`. External sets (QALB, ZAEBUC) are read from a local path
  given on the command line and never committed.
- Seed sets in the repo: `en-errors`, `en-clean`, `ar-errors`, `ar-clean`,
  each about 150 sentences or 2,000 words, drafted by Claude and reviewed by
  the owner before they count.

## Risks

| Risk | Mitigation |
|---|---|
| `onnxruntime-web` may not run in Node for the evaluation | tinyfix-ar accepts an injected runtime (`onnxruntime-node`); for tinyfix, fall back to running the evaluation in headless Chromium with Playwright, already a dev dependency |
| The two packages read the network themselves | Both take `baseUrl`; the offline test (story 5) fails the build on any third-party request |
| Masking removes context across a foreign word | Acceptable for M0; measured on mixed-text cases in the Arabic set |
| Arabic seed sets written by a model may be unnatural | Owner review is part of story 6's acceptance criteria |

## Stories

1. **Workspace and core** — npm workspaces, TypeScript strict, Vitest, CI;
   `core` types, language runs, masking, merging, applying.
2. **Model delivery** — lock file, fetch and verify script, self-hosted ORT
   `.wasm`, `NOTICE`.
3. **Checkers in a worker** — `checker-en`, `checker-ar`, worker protocol,
   stale-reply handling, load errors.
4. **Playground page** — input, marked view, suggestion list, accept / ignore
   / accept-all, timings, RTL and LTR.
5. **Offline** — service worker; Playwright test: no third-party requests,
   reload works offline.
6. **Evaluation** — runner, metrics, report, seed sets reviewed by the owner.

Order: 1 → 2 → 3 → 4 → 5, with 6 starting after 3.
