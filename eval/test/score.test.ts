import type { Suggestion } from "@arabiccheck/core";
import { describe, expect, it } from "vitest";
import { addCounts, CROSSING, metrics, outputTokens, scoreCase, ZERO } from "../src/score.ts";
import type { TestCase } from "../src/sets.ts";

const at = (text: string, typed: string, replacement: string, from = 0): Suggestion => {
  const start = text.indexOf(typed, from);
  return {
    start,
    end: start + typed.length,
    typed,
    replacement,
    lang: "ar",
    kind: "real-word",
    score: 1,
    scoreKind: "margin",
    checker: "test@0",
  };
};

const testCase = (text: string, expected: string): TestCase => ({ id: "c1", lang: "ar", text, expected, source: "test" });

describe("outputTokens", () => {
  it("applies each suggestion inside its token, keeping attached punctuation", () => {
    const text = "سافرت الى الرياظ.";
    expect(outputTokens(text, [at(text, "الى", "إلى"), at(text, "الرياظ", "الرياض")])).toEqual([
      "سافرت",
      "إلى",
      "الرياض.",
    ]);
  });

  it("returns the tokens unchanged with no suggestions, whatever the spacing", () => {
    expect(outputTokens("  a  letter\nform ", [])).toEqual(["a", "letter", "form"]);
  });

  it("marks every token a boundary-crossing suggestion touches as an unmatchable change", () => {
    const text = "a letter form the bank";
    const crossing = { ...at(text, "form the", "from"), lang: "en" as const };
    expect(outputTokens(text, [crossing])).toEqual(["a", "letter", CROSSING, CROSSING, "bank"]);
  });

  it("applies several suggestions inside one token without shifting each other", () => {
    const text = "(الى/الرياظ)";
    expect(outputTokens(text, [at(text, "الى", "إلى"), at(text, "الرياظ", "الرياض")])).toEqual(["(إلى/الرياض)"]);
  });
});

describe("scoreCase", () => {
  it("counts a correct fix, a missed error, a wrong fix and a false alarm", () => {
    // tokens:   0       1     2        3        4
    const text = "ذهبت الى المدرسه في الرياظ";
    const expected = "ذهبت إلى المدرسة في الرياض";
    const suggestions = [
      at(text, "الى", "إلى"), // correct fix
      // المدرسه is missed
      at(text, "في", "فى"), // false alarm on a correct word
      at(text, "الرياظ", "الرياط"), // wrong fix
    ];
    const { counts, events } = scoreCase(testCase(text, expected), suggestions);
    expect(counts).toEqual({
      tokens: 5,
      errors: 3,
      correctTokens: 2,
      changes: 3,
      correctFixes: 1,
      falseAlarms: 1,
      wrongFixes: 1,
    });
    expect(events.map((e) => [e.index, e.outcome])).toEqual([
      [1, "fixed"],
      [2, "missed"],
      [3, "false-alarm"],
      [4, "wrong-fix"],
    ]);
    expect(events[3]).toMatchObject({ id: "c1", typed: "الرياظ", output: "الرياط", expected: "الرياض" });
  });

  it("scores a boundary-crossing change as a wrong fix on errors and a false alarm on correct words", () => {
    const text = "a letter form the bank";
    const crossing = { ...at(text, "form the", "from"), lang: "en" as const };
    const { counts, events } = scoreCase(testCase(text, "a letter from the bank"), [crossing]);
    expect(counts).toMatchObject({ errors: 1, changes: 2, correctFixes: 0, wrongFixes: 1, falseAlarms: 1 });
    expect(events.map((e) => [e.index, e.outcome])).toEqual([
      [2, "wrong-fix"],
      [3, "false-alarm"],
    ]);
  });

  it("refuses a case whose text and expected differ in token count", () => {
    expect(() => scoreCase(testCase("a letter form the bank", "a letter from bank"), [])).toThrow(
      /c1: text has 5 tokens but expected has 4/,
    );
  });

  it("records nothing for a clean case left alone", () => {
    const { counts, events } = scoreCase(testCase("نص سليم", "نص سليم"), []);
    expect(counts).toEqual({ ...ZERO, tokens: 2, correctTokens: 2 });
    expect(events).toEqual([]);
  });
});

describe("metrics", () => {
  it("computes precision, recall and false alarms per 1,000 correct words", () => {
    const counts = { tokens: 2000, errors: 100, correctTokens: 1900, changes: 80, correctFixes: 72, falseAlarms: 2, wrongFixes: 6 };
    expect(metrics(counts)).toEqual({ precision: 0.9, recall: 0.72, falseAlarmsPer1000: (2 / 1900) * 1000 });
  });

  it("reports what can't be measured as null rather than a made-up number", () => {
    expect(metrics(ZERO)).toEqual({ precision: null, recall: null, falseAlarmsPer1000: null });
  });

  it("adds counts field by field", () => {
    const one = { tokens: 1, errors: 1, correctTokens: 0, changes: 1, correctFixes: 1, falseAlarms: 0, wrongFixes: 0 };
    expect(addCounts(one, one)).toEqual({ tokens: 2, errors: 2, correctTokens: 0, changes: 2, correctFixes: 2, falseAlarms: 0, wrongFixes: 0 });
  });
});
