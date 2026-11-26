# AgDR-0007: Playground page — pure view logic tested in Node, a thin DOM layer, Vite with a module worker, accept-all in core

**Status**: Proposed · **Date**: 2026-11-26 · **Decided by**: Claude, plan approved by the owner ("go", 2026-11-26; English-only labels by the owner on 2026-11-25) · **Issue**: #8

## Context

Story 4 (#8) is the first page anyone will use. The design (docs/design,
"Playground UI") fixes the shape: plain TypeScript and CSS, a textarea with
`dir="auto"`, a marked copy of the text paragraph by paragraph, a suggestion
list with accept, ignore and accept-all, and a footer with timings. AgDR-0001
already chose Vite for the build and no UI framework. Building it still needs
choices:

1. How to test a page without adding a DOM library.
2. How Vite builds the module worker and the ONNX runtime, which both
   checker packages import as `onnxruntime-web/wasm`.
3. Where accept-all lives, and what it does with overlapping or stale
   suggestions.
4. What "ignored for the session" stores, given that nothing the user types
   may leave the device or be kept.

## Options

| Choice | Options | Picked |
|---|---|---|
| Testing the page | jsdom or happy-dom (new dev dependency); Playwright component tests; **pure view logic in Node, DOM layer checked in the browser** | Pure logic + browser check |
| Accept-all | In the page; **`applyAll()` in core next to `apply()`** | Core |
| Ignored words | `sessionStorage`; **in memory for the page's lifetime** | In memory |
| ORT build in the bundle | The default `ort.wasm.bundle` build (loader bundled; Vite also copies its 15 MB `.wasm` into `assets/`, unused because `wasmPaths` wins); **the `onnxruntime-web-use-extern-wasm` condition (`ort.wasm.min`, which loads its `.mjs` and `.wasm` from `wasmPaths`)** | Extern wasm |
| Workspace packages in Vite | Always source; always `dist/`; **source in `vite dev`, `dist/` in `vite build`** | As AgDR-0006 |

## Decision

- **`apps/playground/src/view.ts` holds all page logic as pure functions**:
  splitting the text into paragraphs with each suggestion's marks in place,
  the list entries, ignoring a word, and re-validating suggestions against the
  current text (`merge` from core). It is unit-tested in Node like the
  packages, and counts toward coverage. **`main.ts` is the DOM layer** only:
  it reads the textarea, debounces, calls the worker client and renders
  `view.ts`'s output with `textContent` and created elements, never
  `innerHTML`. It is excluded from coverage (as `worker.ts` and `eval/src/run.ts`
  are) and checked in a real browser; the Playwright test in #9 covers it
  end to end.
- **Vite** (`vite@8.3.8`, exact, already in the tree through Vitest; published
  more than two weeks ago) becomes the playground's dev dependency. The page
  starts the worker with `new Worker(new URL("./checker.worker.ts",
  import.meta.url), { type: "module" })`; that file only imports
  `@arabiccheck/worker/worker`. `worker.format` is `es`. `vite dev` resolves
  workspace packages to source with the `@arabiccheck/source` condition;
  `vite build` uses their built `dist/` (root `build` builds them first).
  Both modes add the `onnxruntime-web-use-extern-wasm` condition, so the
  bundle holds ORT's small `ort.wasm.min` build, and the page passes
  `wasmPaths` pointing at `/ort/`, where `copy-ort` already puts the `.mjs`
  loader and the `.wasm` (AgDR-0005). Both load from the page's own origin and
  ship once. `onnxruntime-web`, `tinyfix` and `tinyfix-ar` are excluded from
  dependency pre-bundling in dev.
- **`applyAll(text, suggestions)` in core** applies every suggestion that
  still holds its typed text, from the end of the text backwards so earlier
  offsets stay valid, and skips any that overlaps one already applied. Same
  rules as `apply()` (FR-003).
- **Ignored words are a `Set` in memory**, keyed by the exact typed word,
  sent with each check (the worker already accepts `ignored`) and applied on
  the page at once so the mark disappears without waiting for the next check.
  A reload forgets them. Nothing the user types is written to storage.
- **Accepting keeps undo.** `applyAll` decides which suggestions still
  apply; each is then typed into the text box with
  `document.execCommand("insertText")`, the only way to change a text box
  that the browser's own Ctrl+Z can undo (setting `value` empties the undo
  history). It is deprecated but supported by every current browser; if it
  fails, the page falls back to `setRangeText` and then to the exact
  `applyAll` result. The caret moves with the text (`moveOffset`).
- **The build uses relative URLs** (`base: "./"`), and the page finds
  `models/` and `ort/` from `document.baseURI`, so it works from a sub-path.
- **Checking** is debounced by 250 ms (design, data flow). The client already
  drops replies for older text; the page also re-merges each result against
  the textarea's current value before rendering, so a suggestion whose word
  has changed is never shown or applied.

## Consequences

- No new dependency beyond Vite, which AgDR-0001 already chose.
- The DOM layer has no unit tests. It stays small on purpose, and #9's
  Playwright test exercises the page; until then it is checked by hand in the
  browser, with the steps listed in the PR.
- Ignored words don't survive a reload. If testers want that, it is a later,
  separate choice about storing user words on the device.
