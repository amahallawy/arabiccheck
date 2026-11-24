# AgDR-0005: Build scripts in TypeScript run by Node; how model and runtime files are delivered

**Status**: Proposed · **Date**: 2026-11-24 · **Decided by**: Claude, options approved by the owner before the build · **Issue**: #6

## Context

AgDR-0003 decided *what* model delivery does: a lock file with pinned URLs,
sizes and SHA-256 hashes, a fetch script that refuses mismatches, and a
self-hosted `onnxruntime-web` runtime. Building it (#6) needs four smaller
choices it left open:

1. The design names the fetch script `scripts/fetch-models.mjs`: plain
   JavaScript, outside the project's strict TypeScript.
2. `onnxruntime-web` has to be installed somewhere before its `.wasm` can be
   copied, but the playground app it belongs to only arrives in #8.
3. AgDR-0003 pins tinyfix-ar at the tag `v1.0.0`. Tags on Hugging Face can be
   moved; commits cannot.
4. `onnxruntime-web` 1.31.1 ships several WebAssembly builds (plain SIMD
   14.8 MB, WebGPU/JSEP 29.5 MB, JSPI 17.9 MB, Asyncify 28.7 MB).

## Options

| Choice | Options | Picked |
|---|---|---|
| Script language | `.mjs` as designed; `.mjs` with `// @ts-check`; **TypeScript run directly by Node 24** (type stripping, no build step) | TypeScript |
| Where `onnxruntime-web` lives | Root `devDependencies`; the checker packages (#7); **a bare `apps/playground` workspace now** | `apps/playground` |
| tinyfix-ar revision | Tag `v1.0.0`; **the commit the tag points to** | Commit |
| Which runtime build | Copy all of `dist/`; **only `ort-wasm-simd-threaded.{wasm,mjs}`** | SIMD build only |

## Decision

- **Scripts are TypeScript** (`scripts/*.ts`), run as `node scripts/x.ts`.
  Node 24 strips types itself, so no build step or loader is added. The
  scripts use only erasable syntax (`erasableSyntaxOnly`), are type-checked by
  `npm run typecheck` through `scripts/tsconfig.json`, and their logic lives
  in `scripts/lib/` with Vitest tests. Adds one dev dependency:
  `@types/node@24.19.2` (matches Node 24; published 2026-10-09).
- **`apps/playground` exists from #6** as a workspace holding
  `onnxruntime-web@1.31.1` (exact) and the `public/models/` and `public/ort/`
  folders (both gitignored). Its `build` copies the runtime files today;
  #8 adds the Vite build after that step.
- **Every URL pins a commit.** tinyfix at `8efdf5cd…` (what tinyfix 0.1.1
  uses), tinyfix-ar at `f760e7ea…` (the commit tag `v1.0.0` pointed to on
  2026-11-24, what tinyfix-ar 1.0.0 uses). The lock records the tag alongside
  for readers.
- **Only the plain SIMD build ships.** Both packages import
  `onnxruntime-web/wasm` with one thread, which loads
  `ort-wasm-simd-threaded.wasm` (and its `.mjs` loader when unbundled). One
  thread means no cross-origin isolation headers are needed.
- `fetch-models` never edits the lock. `--relock` re-downloads every locked
  URL and rewrites sizes and hashes; it is the only way the lock changes.
  Downloads follow redirects (Hugging Face serves large files from its CDN).
  A normal run needn't trust the redirect target, because the bytes must
  match the locked hash; `--relock` does trust it (capped at 64 MB a file,
  empty bodies refused, the new lock re-validated before writing), so a
  relock's diff of `models.lock.json` is reviewed like code.

## Consequences

- Scripts get the same type safety as the packages, at the cost of Node 24
  being required (already the case, per `engines`).
- Changing a model means editing its URLs in the lock, running `--relock`,
  and reviewing the hash diff in the PR.
- **Budget for SC-004 (first load under 25 MB):** the shipped files total
  32.8 MB raw (models 18.0 MB, runtime 14.9 MB) but **15.0 MB with gzip -9**
  (measured in #6: the runtime `.wasm` shrinks from 14.8 to 3.8 MB; the ONNX
  weights barely compress). So the budget holds only if the page is served
  with compression; #9 confirms the real transfer size end to end.
- Node's fetch uses its own CA list, which fails behind TLS-inspecting
  proxies and antivirus (`SELF_SIGNED_CERT_IN_CHAIN`). `fetch-models` runs
  with `--use-system-ca`, so it trusts what the operating system trusts;
  certificates are still verified, and the hashes are checked regardless.
