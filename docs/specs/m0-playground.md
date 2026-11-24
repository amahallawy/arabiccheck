# Feature Specification: M0 — offline playground

**Parent issue**: #3
**Created**: 2026-11-24
**Status**: Approved (PR #4, 2026-11-24)
**Due**: 2026-12-08
**Input**: Owner decisions in Company ADR-0004: offline-only, Arabic and English,
MIT, a playground first and the browser extension after.

## Purpose

M0 answers one question before any extension work: **how good are offline
spelling and real-word checks for Arabic and English, today, on real text?**
It delivers a page anyone can open to try the checkers, and numbers that say
how often they are right.

M0 is not the product. It has no extension, no grammar rules, no settings
beyond what testing needs.

## User Scenarios & Testing

### User Story 1 — Check Arabic text on the page (Priority: P1)

A writer pastes or types Arabic into the playground and sees the words the
checker would change, each with its suggested replacement, and can accept or
ignore each one.

**Why this priority**: Arabic is the project's reason to exist.

**Independent Test**: open the page with the network off (after the first
load), type `ذهبت الى المدرسه في الرياظ`, and see three suggestions:
`إلى`, `المدرسة`, `الرياض`.

**Acceptance Scenarios**:

1. **Given** the page has loaded, **When** I type Arabic with known errors,
   **Then** each error is marked in the text and listed with its replacement.
2. **Given** a suggestion, **When** I accept it, **Then** only that word
   changes; diacritics and spacing elsewhere stay exactly as typed.
3. **Given** a suggestion, **When** I ignore it, **Then** it disappears and is
   not shown again for that word during the session.
4. **Given** correct Arabic text, **When** I type it, **Then** nothing is marked.

### User Story 2 — Check English text on the page (Priority: P1)

The same, for English: misspellings (`recieve`) and real-word errors
(`a letter form the bank`).

**Independent Test**: type `I got a letter form the bank and recieve it`,
see `from` and `receive` suggested.

**Acceptance Scenarios**:

1. **Given** English text with errors, **Then** each is marked and listed,
   labelled spelling or real-word.
2. **Given** code, URLs or email addresses in the text, **Then** they are not
   marked.

### User Story 3 — Mixed Arabic and English (Priority: P2)

Text that mixes both languages, line by line or inside one sentence, is
checked by the right checker for each part.

**Independent Test**: one paragraph with an Arabic sentence containing an
English product name, and an English line below; each error is found by the
matching checker and no English word is sent to the Arabic checker or the
reverse.

**Acceptance Scenarios**:

1. **Given** mixed text, **Then** Arabic runs go to the Arabic checker and
   Latin runs to the English checker.
2. **Given** an RTL paragraph with an LTR word inside, **Then** the marks sit
   on the right characters.

### User Story 4 — Measure quality (Priority: P1)

A contributor runs one command and gets, per language and per test set:
how many errors were fixed (recall), how many changes were right
(precision), and how many correct words were wrongly changed (false alarms
per 1,000 words).

**Why this priority**: the project's rule is precision over recall; without
numbers, no later change can be judged.

**Independent Test**: run the evaluation command on a fresh clone; it prints a
table and writes a JSON report.

**Acceptance Scenarios**:

1. **Given** the repo's own test sets, **When** I run the evaluation,
   **Then** I get recall, precision and false alarms per 1,000 words for each
   set.
2. **Given** a locally downloaded external test set (not committed), **When**
   I point the evaluation at it, **Then** it is scored the same way.

### User Story 5 — It really is offline (Priority: P1)

**Independent Test**: load the page once, turn the network off, reload: it
still checks text. Watching the network panel while typing shows no requests
at all, and no request ever goes to a third-party origin.

### Edge Cases

- Empty text, very long text (10,000 words): the page stays responsive while
  typing; checking happens off the main thread.
- Text with full diacritics (tashkeel), tatweel, Arabic-Indic digits, emoji.
- A word the checker doesn't know (dialect, names): left alone.
- Models fail to load (corrupt file, wrong hash): the page says which file and
  doesn't check with a broken model.
- A suggestion that no longer matches the text because the user kept typing:
  it is dropped, never applied to the wrong characters.

## Requirements

### Functional Requirements

- **FR-001**: The page MUST check Arabic with tinyfix-ar and English with
  tinyfix, splitting text into Arabic and Latin runs first.
- **FR-002**: Every suggestion MUST carry its span (start and end in the
  original text), the typed text, the replacement, its kind (spelling,
  real-word, and the Arabic edit kind such as hamza or taa marbuta where
  known), its confidence, and which checker made it.
- **FR-003**: Accepting a suggestion MUST change only its span, and only if
  the span still holds the typed text.
- **FR-004**: The page MUST mark suggestions in the text and list them, with
  accept, ignore and accept-all.
- **FR-005**: The page MUST be usable in Arabic (RTL) and English (LTR);
  each paragraph takes the direction of its text.
- **FR-006**: Checking MUST run off the main thread and MUST NOT block typing.
- **FR-007**: The page MUST make no network request to any origin other than
  its own, and none at all while checking.
- **FR-008**: Model files MUST be pinned to an exact revision and verified
  against a recorded SHA-256 hash before use.
- **FR-009**: The evaluation command MUST report recall, precision and false
  alarms per 1,000 words, per language and per test set, as a table and as
  JSON.
- **FR-010**: The repo MUST include small test sets of its own (MIT): Arabic
  and English sentences with marked errors, and clean text for false alarms.
- **FR-011**: The page MUST show load time and per-check time, for testing.
- **FR-012**: Every third-party model and word list that ships MUST be listed
  in `NOTICE` with source and licence.

### Key Entities

- **Suggestion**: span, typed text, replacement, kind, confidence, checker id.
- **Checker**: something that takes text in one language and returns
  suggestions. M0 has two: English (tinyfix) and Arabic (tinyfix-ar).
- **Test case**: a text, plus the expected corrected text (or "no change").
- **Test set**: a named file of test cases, with its source and licence.

## Success Criteria

- **SC-001**: On the clean-text sets, false alarms are **at most 1 per 1,000
  words** for each language (the models' own published level is about 0.5).
- **SC-002**: On the repo's error sets, precision is **at least 90%** for each
  language.
- **SC-003**: After loading, a check of one paragraph (about 100 words) takes
  **under 100 ms** on a mid-range laptop, and typing never stutters.
- **SC-004**: First load downloads **under 25 MB** in total; later loads use
  the browser cache.
- **SC-005**: With the network off after the first load, the page still works.
- **SC-006**: Zero requests to third-party origins, checked by an automated
  test.

Recall is reported but has no target in M0: the point is to learn it.

## Out of Scope (later milestones)

- The browser extension (M1).
- Arabic words outside tinyfix-ar's 100,000-word vocabulary (a Hunspell-based
  Arabic spell check is an M1 candidate).
- Grammar rules (M2), neural grammar models (M3), tone or rewriting.
- Settings such as "strict MSA / relaxed" (M1, once suggestions show in real
  text boxes).

## Assumptions

- tinyfix 0.1.1 and tinyfix-ar 1.0.0 behave as their model cards describe.
- Arabic test sentences are drafted by Claude and reviewed by the owner, a
  native speaker, before they count.
- External sets such as QALB or ZAEBUC are research-licensed: they may be
  downloaded and scored locally, never committed or used for training.
