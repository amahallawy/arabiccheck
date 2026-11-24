# AgDR-0003: Self-host pinned, hash-checked model files; cache them with a service worker

**Status**: Proposed · **Date**: 2026-11-24 · **Decided by**: Claude (for owner review) · **Issue**: #3

## Context

By default both packages download their files from Hugging Face at runtime,
and `onnxruntime-web` can fetch its `.wasm` from a CDN. The project's
offline rule allows downloads of models only from pinned sources with
recorded hashes, and the spec forbids any request to a third-party origin
(FR-007, SC-006) and requires the page to work offline after the first load
(SC-005). The files total about 17 MB (English 3.5 MB, Arabic 14 MB), plus
the runtime's `.wasm`.

## Options

| Option | For | Against |
|---|---|---|
| Load from Hugging Face at runtime | Nothing to host | A third-party request every load; breaks the offline promise |
| Commit the files to git | Simple checkout | 17 MB+ of binaries in history, growing with each model update |
| **Fetch at build from pinned URLs, verify SHA-256, serve same-origin** | No third-party requests; reproducible; small repo | A fetch step before building |
| Bundle the files into the JavaScript | One artefact | Huge bundles; no caching per file |

## Decision

- `models.lock.json` lists each file: package, exact Hugging Face revision
  URL (tinyfix at commit `8efdf5cd…`, tinyfix-ar at tag `v1.0.0`, matching
  what each package version was tested with), size and SHA-256.
- `npm run fetch-models` downloads into `apps/playground/public/models/`
  (gitignored) and fails on any hash or size mismatch. `--relock` updates
  the lock deliberately and is used only when bumping a model.
- Adapters pass `baseUrl: "/models/en/"` and `"/models/ar/"`; the runtime
  gets `wasmPaths: "/ort/"`, with the `.wasm` files copied from
  `node_modules/onnxruntime-web/dist` at build.
- A small **hand-written service worker** caches the page, scripts, `.wasm`
  and model files on first load (cache-first, versioned by the lock file's
  hash), so reloads work offline.
- `NOTICE` lists each file's source and licence (both MIT).

## Consequences

- Building needs network once; using the page never does after the first load.
- The same lock file and fetch script serve the extension in M1.
- Hashes are checked at fetch time. In-browser re-verification is possible
  for tinyfix-ar (custom bundle reader) but not for tinyfix without wrapping
  `fetch`; deferred to M1, where the extension ships the files itself.
