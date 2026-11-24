import { describe, expect, it } from "vitest";
import { merge, type Suggestion } from "../src/index.js";

const TEXT = "ذهبت الى المدرسه and recieve it";

function suggestion(start: number, end: number, replacement: string, score = 0.9): Suggestion {
  return {
    start,
    end,
    typed: TEXT.slice(start, end),
    replacement,
    lang: /[a-z]/.test(TEXT.slice(start, end)) ? "en" : "ar",
    kind: "spelling",
    score,
    scoreKind: "confidence",
    checker: "test@0",
  };
}

// Spans in TEXT: "الى" 5..8, "المدرسه" 9..16, "recieve" 21..28.
const ILA = suggestion(5, 8, "إلى");
const MADRASA = suggestion(9, 16, "المدرسة");
const RECEIVE = suggestion(21, 28, "receive");

describe("merge", () => {
  it("returns nothing for no suggestions", () => {
    expect(merge(TEXT, [])).toEqual([]);
  });

  it("sorts suggestions by start", () => {
    expect(merge(TEXT, [RECEIVE, ILA, MADRASA])).toEqual([ILA, MADRASA, RECEIVE]);
  });

  it("keeps the higher score when two suggestions overlap, in either input order", () => {
    const weak = suggestion(9, 16, "المدرسة", 0.4);
    const strong = suggestion(9, 12, "ألم", 0.8);
    expect(merge(TEXT, [weak, strong])).toEqual([strong]);
    expect(merge(TEXT, [strong, weak])).toEqual([strong]);
  });

  it("keeps the earlier start when overlapping suggestions tie on score", () => {
    const first = suggestion(9, 16, "المدرسة", 0.5);
    const second = suggestion(12, 16, "رسة", 0.5);
    expect(merge(TEXT, [second, first])).toEqual([first]);
  });

  it("keeps the first given when overlapping suggestions tie on score and start", () => {
    const a = suggestion(9, 16, "المدرسة", 0.5);
    const b = suggestion(9, 16, "مدرسة", 0.5);
    expect(merge(TEXT, [a, b])).toEqual([a]);
    expect(merge(TEXT, [b, a])).toEqual([b]);
  });

  it("resolves a chain of overlaps strongest first", () => {
    // a overlaps b, b overlaps c, a and c do not overlap; a is strongest.
    const a = suggestion(9, 12, "ألم", 0.9);
    const b = suggestion(11, 14, "مدن", 0.8);
    const c = suggestion(13, 16, "رسة", 0.7);
    expect(merge(TEXT, [c, b, a])).toEqual([a, c]);
  });

  it("drops both when suggestions with different score kinds overlap", () => {
    const confidence = suggestion(9, 16, "المدرسة", 0.9);
    const margin = { ...suggestion(9, 16, "مدرسة", 3.2), scoreKind: "margin" as const };
    expect(merge(TEXT, [ILA, confidence, margin])).toEqual([ILA]);
  });

  it("keeps suggestions with different score kinds when they do not overlap", () => {
    const margin = { ...ILA, score: 3.2, scoreKind: "margin" as const };
    expect(merge(TEXT, [RECEIVE, margin])).toEqual([margin, RECEIVE]);
  });

  it("drops a suggestion whose score is not a finite number", () => {
    const nan = { ...MADRASA, score: Number.NaN };
    const infinite = { ...RECEIVE, score: Number.POSITIVE_INFINITY };
    expect(merge(TEXT, [nan, ILA, infinite])).toEqual([ILA]);
  });

  it("drops an empty span", () => {
    const empty = { ...RECEIVE, start: 21, end: 21, typed: "" };
    expect(merge(TEXT, [ILA, empty])).toEqual([ILA]);
  });

  it("drops a span that splits a surrogate pair", () => {
    const text = "😀 hi";
    const half = { ...RECEIVE, start: 1, end: 4, typed: text.slice(1, 4), replacement: "x" };
    expect(merge(text, [half])).toEqual([]);
  });

  it("keeps suggestions that only touch at an edge", () => {
    const left = suggestion(0, 4, "ذهبتُ");
    const right = suggestion(4, 5, "_");
    expect(merge(TEXT, [right, left]).map((s) => s.start)).toEqual([0, 4]);
  });

  it("drops suggestions for ignored words", () => {
    expect(merge(TEXT, [ILA, RECEIVE], new Set(["recieve"]))).toEqual([ILA]);
  });

  it("drops a suggestion whose span no longer holds the typed text", () => {
    const stale = { ...RECEIVE, typed: "recieved" };
    expect(merge(TEXT, [ILA, stale])).toEqual([ILA]);
  });

  it("drops a suggestion whose span is outside the text", () => {
    const outside = { ...RECEIVE, start: 40, end: 47 };
    const backwards = { ...RECEIVE, start: 28, end: 21 };
    const fractional = { ...RECEIVE, start: 21.5 };
    expect(merge(TEXT, [ILA, outside, backwards, fractional])).toEqual([ILA]);
  });

  it("drops a suggestion that would change nothing", () => {
    expect(merge(TEXT, [ILA, { ...RECEIVE, replacement: "recieve" }])).toEqual([ILA]);
  });

  it("does not modify the array it is given", () => {
    const input = [RECEIVE, ILA];
    merge(TEXT, input);
    expect(input).toEqual([RECEIVE, ILA]);
  });
});
