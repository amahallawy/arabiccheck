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

- Manual review of the diff by Claude's code-reviewer agent with no blocking
  issues — until CI is added. Once CI exists, its workflows are listed here and
  become required checks.

**Marker 2 (explicit authorization):**

- `lgtm` / `approved` comment on the PR by the repo owner.

### Current state: active

PR-first workflow is in use from the first commit. Enable GitHub branch
protection on `main` requiring a PR (and the CI checks above, once they exist).
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
- Each released model gets a data card listing its training sources.

### Layout (planned; each piece lands with its own issue and AgDR)

```
packages/core/        pipeline, Checker interface, merging, offset mapping
packages/checkers/    one package per checker (spell-en, spell-ar, tinyfix, tinyfix-ar, ...)
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
