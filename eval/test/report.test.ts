import { describe, expect, it } from "vitest";
import { formatReport, toJson, verdict, type SetRun } from "../src/report.ts";
import { ZERO, type TokenEvent } from "../src/score.ts";
import type { SetInfo } from "../src/sets.ts";

const info = (overrides: Partial<SetInfo>): SetInfo => ({
  name: "en-errors",
  file: "en-errors.jsonl",
  lang: "en",
  kind: "errors",
  source: "Drafted by Claude",
  licence: "MIT",
  ...overrides,
});

const event: TokenEvent = { id: "e7", index: 2, typed: "there", output: "their", expected: "there", outcome: "false-alarm" };

const run = (overrides: Partial<SetRun>): SetRun => ({
  set: info({}),
  config: "careful",
  external: false,
  cases: 10,
  counts: { ...ZERO, tokens: 100, errors: 10, correctTokens: 90, changes: 10, correctFixes: 9, wrongFixes: 1 },
  events: [],
  ms: 1234,
  ...overrides,
});

describe("verdict", () => {
  it("checks error sets against SC-002 (precision at least 90%)", () => {
    expect(verdict(run({}))).toEqual({ target: "SC-002", pass: true, counted: true });
    const low = run({ counts: { ...ZERO, tokens: 100, errors: 10, correctTokens: 90, changes: 10, correctFixes: 8, wrongFixes: 2 } });
    expect(verdict(low)).toMatchObject({ target: "SC-002", pass: false });
  });

  it("fails SC-002 when there were no changes to measure precision on", () => {
    expect(verdict(run({ counts: { ...ZERO, tokens: 10, errors: 2, correctTokens: 8 } }))).toMatchObject({ pass: false });
  });

  it("checks clean sets against SC-001 (at most 1 false alarm per 1,000 words)", () => {
    const clean = info({ name: "en-clean", kind: "clean" });
    const counts = { ...ZERO, tokens: 2000, correctTokens: 2000, changes: 2, falseAlarms: 2 };
    expect(verdict(run({ set: clean, counts }))).toEqual({ target: "SC-001", pass: true, counted: true });
    expect(verdict(run({ set: clean, counts: { ...counts, changes: 3, falseAlarms: 3 } }))).toMatchObject({ pass: false });
  });

  it("doesn't count an Arabic set until the owner has reviewed it; external sets always count", () => {
    const arabic = info({ name: "ar-errors", lang: "ar" });
    expect(verdict(run({ set: arabic })).counted).toBe(false);
    expect(verdict(run({ set: { ...arabic, reviewed: { by: "owner", on: "2026-11-26" } } })).counted).toBe(true);
    expect(verdict(run({ set: arabic, external: true })).counted).toBe(true);
  });
});

describe("formatReport", () => {
  it("prints one row per set and configuration, with the target and whether it counts", () => {
    const text = formatReport([
      run({}),
      run({ set: info({ name: "ar-errors", lang: "ar" }), events: [event] }),
    ]);
    expect(text).toMatch(/en-errors\s+\|\s+careful\s+\|\s+10\s+\|\s+100\s+\|\s+10\s+\|\s+10\s+\|\s+9\s+\|\s+90\.0%\s+\|\s+90\.0%\s+\|\s+0\.00\s+\|\s+SC-002 pass/);
    expect(text).toMatch(/ar-errors .* SC-002 pass \(not counted: not yet reviewed by the owner\)/);
    expect(text).toContain('false-alarm  e7 #2: "there" -> "their" (expected "there")');
  });

  it("shows a ratio with nothing to divide by as n/a", () => {
    expect(formatReport([run({ counts: ZERO })])).toMatch(/n\/a\s+\|\s+n\/a\s+\|\s+n\/a/);
  });
});

describe("toJson", () => {
  it("includes the counts, metrics, verdict and every event of each run", () => {
    const json = toJson([run({ events: [event] })], "2026-11-25T10:00:00.000Z");
    expect(json).toMatchObject({
      generated: "2026-11-25T10:00:00.000Z",
      runs: [
        {
          set: "en-errors",
          lang: "en",
          kind: "errors",
          config: "careful",
          counted: true,
          metrics: { precision: 0.9, recall: 0.9, falseAlarmsPer1000: 0 },
          verdict: { target: "SC-002", pass: true },
          events: [event],
        },
      ],
    });
  });
});
