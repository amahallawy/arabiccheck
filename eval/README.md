# Evaluation

How often ArabicCheck's checkers are right, measured on real text with the real
models. The method is in [AgDR-0004](../docs/agdr/AgDR-0004-evaluation.md).

```sh
npm run fetch-models                              # once: the models the runner loads
npm run eval                                      # score the seed sets below
npm run eval -- --set C:\data\qalb-dev.jsonl      # also score a local set (never committed)
npm run eval -- --json other-report.json          # write the report somewhere else
```

`npm run eval` builds the packages, then runs every case through the same worker
handler the playground uses (each checker sees only its own language, then the
results are merged). English sets run twice: `careful`, which ships, and
`balanced`, for comparison. It prints a table and writes `eval/report.json`
(gitignored); record the table in the PR that changes a checker.

## What the numbers mean

Scoring is per whitespace-separated token. A token is an **error** if its typed
form differs from the expected one, and **changed** if the checker's output
differs from what was typed.

| Metric | Is | Target |
|---|---|---|
| Precision | correct fixes / changes | at least 90% on error sets (spec SC-002) |
| Recall | correct fixes / errors | reported, no target in M0 |
| False alarms per 1,000 | changes to correct tokens / correct tokens × 1,000 | at most 1 on clean sets (SC-001) |

Below the table the runner lists every false alarm, wrong fix and miss with its
case id; `report.json` also has the correct fixes.

## Sets

Each line of a `.jsonl` set is one case:

```json
{"id": "en-errors-001", "lang": "en", "text": "a letter form the bank", "expected": "a letter from the bank", "source": "seed-v1"}
```

M0's checkers only substitute words, so `text` and `expected` must have the same
number of tokens; the loader rejects any case that doesn't, and any case in a
clean set whose `expected` differs from its `text`.

| Set | What | Size |
|---|---|---|
| `en-errors` | misspellings and real-word errors, one or two per sentence | 151 sentences, 1,227 words |
| `en-clean` | correct English, many sentences using commonly confused words correctly | 150 sentences, 1,216 words |
| `ar-errors` | hamza, taa marbuta, alef maqsura, sound-alike letters, letter swaps; some with English words inside | 150 sentences, 894 words |
| `ar-clean` | correct MSA: names such as علي, words like ظل / ضل and سورة / صورة, diacritics, tatweel, Arabic-Indic digits, English words inside | 150 sentences, 861 words |

All four were written for ArabicCheck (MIT); nothing is copied from another
corpus. `sets.json` lists them with their source and licence.

### Review of the Arabic sets

The Arabic sets were drafted by Claude, so **their numbers don't count until the
owner, a native speaker, has reviewed them** (spec, Assumptions). Until then the
table marks them "not counted". After review, the set's entry in `sets.json`
gets `"reviewed": { "by": "<name>", "on": "YYYY-MM-DD" }`.

## External sets

Research-licensed sets such as QALB or ZAEBUC are scored from a local path in
the same JSONL format and are **never committed or used for training**
(CLAUDE.md, Licence hygiene). A set whose cases all expect no change is scored as
a clean set; any other as an error set.
