# AgDR-0002: Use the tinyfix and tinyfix-ar packages behind our own adapters

**Status**: Proposed · **Date**: 2026-11-24 · **Decided by**: Claude (for owner review) · **Issue**: #3

## Context

M0 checks English spelling and real-word errors, and Arabic real-word errors
and common misspellings. Two MIT packages exist:

- `tinyfix` 0.1.1 (English): its own spelling check (80,000-word list, edit
  distance) plus the 2.1 MB real-word model. Returns spans, kind and a 0–1
  confidence. Skips code, URLs and emails. Takes `baseUrl` and `wasmPaths`.
- `tinyfix-ar` 1.0.0 (Arabic): the 9 MB model plus a 100,000-word lexicon
  with candidate lists. `fix()` returns spans and margins; `judge()` adds the
  edit kind (hamza, taa marbuta, typo, …). Takes `baseUrl`, `wasmPaths` and an
  injectable ONNX runtime.

Both depend on `onnxruntime-web` (`^1.20.1` and `~1.31.1`; 1.31.x satisfies both).

## Options

| Option | For | Against |
|---|---|---|
| **Use the packages as-is, behind adapters** | Calibrated thresholds and tokenizers come for free; small code | Tied to their APIs and release pace |
| Re-implement inference from the ONNX files | Full control | Re-deriving tokenization and calibration, with a high risk of worse precision |
| Fork the packages | Control plus a head start | Maintenance burden before we know what we need to change |

## Decision

Use **`tinyfix@0.1.1`** and **`tinyfix-ar@1.0.0`**, pinned exactly, each
wrapped by a small adapter (`packages/checker-en`, `packages/checker-ar`)
that turns its output into our `Suggestion` type. Nothing outside the
adapters imports either package.

- Run both in **one module Web Worker**. Inside a worker, tinyfix runs inline
  instead of spawning its own worker.
- Use `tinyfix-ar`'s `fix()` for changes (what its thresholds are calibrated
  for) and `judge()` only to label the edit kind.
- Split mixed text by **masking**: each checker sees the text with the other
  language's characters replaced by spaces, so offsets need no mapping.
- Deduplicate to one `onnxruntime-web` 1.31.x, WebAssembly build only.

## Consequences

- Swapping or forking a checker later touches one adapter.
- If an upstream release changes behaviour, the evaluation (AgDR-0004)
  shows it before we bump the pin.
- Arabic words outside the 100,000-word vocabulary go unchecked in M0.
