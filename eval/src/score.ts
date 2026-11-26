import type { Suggestion } from "@arabiccheck/core";
import { tokens, type TestCase } from "./sets.ts";

/** Token counts for one case or a whole set (AgDR-0004). */
export interface Counts {
  readonly tokens: number;
  /** Tokens whose typed form differs from the expected one. */
  readonly errors: number;
  /** Tokens that were already right. */
  readonly correctTokens: number;
  /** Tokens the checker changed. */
  readonly changes: number;
  /** Changed, and now as expected. */
  readonly correctFixes: number;
  /** Changed, though it was already right. */
  readonly falseAlarms: number;
  /** Changed an error, but not to the expected word. */
  readonly wrongFixes: number;
}

export const ZERO: Counts = {
  tokens: 0,
  errors: 0,
  correctTokens: 0,
  changes: 0,
  correctFixes: 0,
  falseAlarms: 0,
  wrongFixes: 0,
};

export type Outcome = "fixed" | "missed" | "false-alarm" | "wrong-fix";

/** One token worth looking at: anything but a correct token left alone. */
export interface TokenEvent {
  readonly id: string;
  readonly index: number;
  readonly typed: string;
  readonly output: string;
  readonly expected: string;
  readonly outcome: Outcome;
}

/** What a token becomes when a suggestion crosses a token boundary: no expected token can match it. */
export const CROSSING = "\u0000(changed across a token boundary)";

/**
 * The text's tokens after the suggestions, one per original token. Each suggestion is
 * applied inside its own token, so punctuation attached to a word stays as typed.
 */
export function outputTokens(text: string, suggestions: readonly Suggestion[]): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    const start = match.index;
    const end = start + match[0].length;
    const touching = suggestions.filter((s) => s.start < end && s.end > start);
    if (touching.some((s) => s.start < start || s.end > end)) {
      out.push(CROSSING);
      continue;
    }
    let token = match[0];
    for (const s of [...touching].sort((a, b) => b.start - a.start)) {
      token = token.slice(0, s.start - start) + s.replacement + token.slice(s.end - start);
    }
    out.push(token);
  }
  return out;
}

/** Scores one case: per token, error = typed ≠ expected, changed = output ≠ typed. */
export function scoreCase(testCase: TestCase, suggestions: readonly Suggestion[]): { counts: Counts; events: TokenEvent[] } {
  const typed = tokens(testCase.text);
  const expected = tokens(testCase.expected);
  if (typed.length !== expected.length) {
    throw new Error(`${testCase.id}: text has ${typed.length} tokens but expected has ${expected.length}`);
  }
  const output = outputTokens(testCase.text, suggestions);
  let errors = 0;
  let changes = 0;
  let correctFixes = 0;
  let falseAlarms = 0;
  let wrongFixes = 0;
  const events: TokenEvent[] = [];

  typed.forEach((word, index) => {
    const want = expected[index] ?? word;
    const got = output[index] ?? word;
    const isError = word !== want;
    const changed = got !== word;
    if (isError) errors++;
    if (changed) changes++;
    let outcome: Outcome | undefined;
    if (changed && got === want) outcome = "fixed";
    else if (changed && !isError) outcome = "false-alarm";
    else if (changed) outcome = "wrong-fix";
    else if (isError) outcome = "missed";
    if (outcome === "fixed") correctFixes++;
    if (outcome === "false-alarm") falseAlarms++;
    if (outcome === "wrong-fix") wrongFixes++;
    if (outcome) events.push({ id: testCase.id, index, typed: word, output: got, expected: want, outcome });
  });

  return {
    counts: { tokens: typed.length, errors, correctTokens: typed.length - errors, changes, correctFixes, falseAlarms, wrongFixes },
    events,
  };
}

export function addCounts(a: Counts, b: Counts): Counts {
  return {
    tokens: a.tokens + b.tokens,
    errors: a.errors + b.errors,
    correctTokens: a.correctTokens + b.correctTokens,
    changes: a.changes + b.changes,
    correctFixes: a.correctFixes + b.correctFixes,
    falseAlarms: a.falseAlarms + b.falseAlarms,
    wrongFixes: a.wrongFixes + b.wrongFixes,
  };
}

export interface Metrics {
  /** Correct fixes / changes. */
  readonly precision: number | null;
  /** Correct fixes / errors. */
  readonly recall: number | null;
  /** Changes to already-correct tokens per 1,000 correct tokens. */
  readonly falseAlarmsPer1000: number | null;
}

/** The three numbers AgDR-0004 defines. A ratio with nothing to divide by is null, not 0. */
export function metrics(counts: Counts): Metrics {
  return {
    precision: counts.changes === 0 ? null : counts.correctFixes / counts.changes,
    recall: counts.errors === 0 ? null : counts.correctFixes / counts.errors,
    falseAlarmsPer1000: counts.correctTokens === 0 ? null : (counts.falseAlarms / counts.correctTokens) * 1000,
  };
}
