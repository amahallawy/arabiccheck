# AgDR-0004: Evaluation — substitution-only JSONL sets, token-aligned scoring, false alarms per 1,000 words

**Status**: Accepted (PR #4, 2026-11-24) · **Date**: 2026-11-24 · **Decided by**: Claude, accepted by the owner · **Issue**: #3

## Context

The project's rule is precision over recall, and every change must be judged
on numbers (spec story 4, SC-001, SC-002). M0's checkers only replace whole
words; they never insert, delete or reorder. External Arabic sets (QALB,
ZAEBUC) are research-licensed and cannot be committed.

## Options

| Option | For | Against |
|---|---|---|
| ERRANT / M² scorer (standard GEC scoring) | Comparable with papers | Python, built for full grammar edits; heavy for word swaps |
| **Own token-aligned scorer over substitution-only sets** | Tiny, exact for what M0 does, runs in Node with the same adapters | Not comparable with GEC papers; needs widening when grammar edits arrive (M2) |
| Manual spot checks | No code | Not repeatable, so no regression signal |

## Decision

- Test sets are **JSONL**: `{ "id", "lang", "text", "expected", "source" }`.
  The loader rejects any case whose `text` and `expected` differ in token count.
- Per token: error = `text ≠ expected`; changed = output ≠ text; correct fix
  = changed and output = expected.
  **Precision** = correct fixes / changes; **recall** = correct fixes /
  errors; **false alarms per 1,000** = changes on already-correct tokens /
  correct tokens × 1,000.
- `npm run eval` runs the adapters in **Node**. If `onnxruntime-web` won't
  run there, the fallback is `onnxruntime-node` for tinyfix-ar and headless
  Chromium (Playwright) for tinyfix.
- Output: a table per set and `eval/report.json`.
- Seed sets in the repo (MIT): `en-errors`, `en-clean`, `ar-errors`,
  `ar-clean`, about 150 sentences or 2,000 words each, drafted by Claude and
  **reviewed by the owner** before they count.
- External sets are read from a local path on the command line, never
  committed and never used for training.

## Consequences

- Every checker change gets a before/after number in its PR.
- When grammar edits arrive (M2), the scorer grows edit alignment (or
  adopts ERRANT-style scoring) and records that in a new AgDR.

## Implementation notes (#10)

How the decision above was applied. No new tool; the runner reuses what
AgDR-0005 and AgDR-0006 already chose.

- `npm run eval` builds the packages, then runs `eval/src/run.ts` with Node 24
  (TypeScript run directly, AgDR-0005). Each case goes through the worker
  handler from `@arabiccheck/worker` with the real adapters, so the numbers
  measure the same masking and merging the page uses. The models are served
  over the local HTTP server the real-model tests use
  (`scripts/lib/model-server.ts`), since both packages fetch their files.
- English sets run in both tinyfix modes, `careful` (ships) and `balanced`,
  as AgDR-0006 promised. Arabic sets run once.
- `eval/sets/sets.json` lists the seed sets. An Arabic set counts only once its
  entry has `reviewed: { by, on }`; until then the table says "not counted".
  Sets given with `--set <path>` always count and are never committed.
- A suggestion is applied inside its own token, so punctuation attached to a
  word is kept; a suggestion that crosses a token boundary counts as a change
  that matches no expected token.
- Scoring code (`eval/src/sets.ts`, `score.ts`, `report.ts`) is unit-tested;
  the command-line runner is exercised by running it.
