# Project: ArabicCheck

Inherits workspace rules from `Company/CLAUDE.md`. This file defines the
project-specific concretions.

**Published to:** https://github.com/amahallawy/arabiccheck (public, MIT)
**Default branch:** main

ArabicCheck is an Arabic-first, offline spelling and grammar checker for the
browser that also checks English. The owner's decisions behind it (offline-only,
Arabic and English, MIT, public) are in Company ADR-0004.

## Merge policy — concrete markers

**Marker 1 (automated review) — all of:**

- The **CI** workflow (`.github/workflows/ci.yml`, job `Typecheck, test,
  build`) is green on the PR's HEAD: `npm ci`, typecheck, unit tests with the
  80% coverage threshold, and build.
- Review of the diff by Claude's code-reviewer agent with no blocking issues.

Run the same checks locally before pushing:
`npm run typecheck && npm run test:coverage && npm run build`.

**Marker 2 (explicit authorization):**

- `lgtm` / `approved` comment on the PR by the repo owner.

### Current state: active

PR-first workflow is in use from the first commit. Enable GitHub branch
protection on `main` requiring a PR and the `Typecheck, test, build` check.
`gh pr merge` requires Marker 2 before merging.

## Status report

This project reports to Company through `.company/status.yaml` (goal, due, progress, health, blockers, next release). Keep it valid and update it at least every 14 days — `gh pr create` is blocked otherwise.

- Check: `python <Company root>/.claude/skills/project-status/status.py check`
- Create / update: `/project-status` (asks the owner for goal, due date and health)

## Project-specific conventions

### Offline is a hard rule

- No text the user types may leave the device. No telemetry, no analytics, no
  remote logging, no cloud inference.
- The only network traffic allowed is downloading models and dictionaries from
  pinned URLs, each checked against a recorded hash. No remote code.
- A feature that needs a server is out of scope, not "optional".

### Precision over recall

- A wrong change to correct text costs more trust than a missed error.
- Every checker is measured on **false alarms per 1,000 correct words** as well
  as recall. A PR that raises false alarms on the evaluation sets needs an
  explicit reason in its description.
- Auto-applied fixes need a calibrated confidence margin; everything else is a
  suggestion the user accepts.

### Arabic and English text handling

- Detect language per paragraph (and per span for mixed text); never assume a
  whole field is one language.
- Arabic normalization (alef forms, taa marbuta / haa, alef maqsura / yaa,
  tatweel, diacritics) is used for matching only. Replacements keep the user's
  own diacritics and characters outside the corrected span.
- Spans and offsets are UTF-16 code units, matching JavaScript strings, and are
  mapped back through any normalization step.
- Corrections that are style conventions (for example `ي` vs `ى`) sit behind a
  "strict MSA / relaxed" setting rather than always firing.
- UI is RTL-correct for Arabic and LTR for English, including mixed lines.

### Licence hygiene

- Project code is MIT. Every third-party model, dictionary or dataset that ships
  is listed in `NOTICE` with its source and licence.
- No non-commercial (NC) or research-only weights or data in anything that ships.
- Research-only data (for example QALB) may be used for evaluation only, never
  for training released weights, unless its licence is confirmed to allow it.
- **One exception (owner decision, Company ADR-0005):** the third-party
  tinyfix-ar model may ship although its author trained it partly on
  QALB-2014 corrected text. It covers that model only; ArabicCheck's own
  weights still never train on QALB, and any other research-derived weights
  need their own owner decision.
- Each released model gets a data card listing its training sources.

### Layout (planned; each piece lands with its own issue and AgDR)

```
packages/core/        Suggestion and Checker types, language runs, masking, merging, applying
packages/checker-*/   one package per checker (checker-en over tinyfix, checker-ar over tinyfix-ar, ...)
packages/worker/      worker protocol, handler, page-side client, worker entry
apps/playground/      M0 test page
apps/extension/       M1 browser extension (Manifest V3)
eval/                 evaluation runner and test sets
training/             Python, model training and ONNX export
docs/agdr/            AgDR-NNNN-<slug>.md, this project's decision records
```

### Code

- TypeScript in strict mode. Python only under `training/`.
- Model inference runs off the main thread (Web Worker, or an offscreen
  document in the extension).
- Library, tooling and architecture choices get an AgDR in `docs/agdr/` before
  the code that depends on them.

### Releases

- Release bar `build`, semver, version in the root `package.json`.
- Every user-visible change adds an entry under `## [Unreleased]` in
  `CHANGELOG.md`, written as what the user notices.
