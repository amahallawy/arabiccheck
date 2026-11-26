import { describe, expect, it } from "vitest";
import { apply, applyAll, type Suggestion } from "../src/index.js";

function suggestion(start: number, end: number, typed: string, replacement: string): Suggestion {
  return {
    start,
    end,
    typed,
    replacement,
    lang: "ar",
    kind: "real-word",
    score: 2.5,
    scoreKind: "margin",
    checker: "test@0",
  };
}

describe("apply", () => {
  it("changes only the suggestion's span", () => {
    const text = "ذهبت الى المدرسه";
    expect(apply(text, suggestion(5, 8, "الى", "إلى"))).toBe("ذهبت إلى المدرسه");
  });

  it("keeps diacritics and spacing outside the span exactly as typed", () => {
    const text = "ذَهَبْتُ  الى  المَدْرَسَةِ";
    const start = text.indexOf("الى");
    const result = apply(text, suggestion(start, start + 3, "الى", "إلى"));
    expect(result).toBe("ذَهَبْتُ  إلى  المَدْرَسَةِ");
  });

  it("handles a replacement of a different length", () => {
    const text = "a letter form the bank";
    expect(apply(text, suggestion(9, 13, "form", "from"))).toBe("a letter from the bank");
    expect(apply("I recieve it", suggestion(2, 9, "recieve", "received"))).toBe("I received it");
  });

  it("uses UTF-16 offsets, so text after an emoji is replaced correctly", () => {
    const text = "😀 recieve";
    expect(apply(text, suggestion(3, 10, "recieve", "receive"))).toBe("😀 receive");
  });

  it("changes nothing when the span no longer holds the typed text", () => {
    const text = "I got a letter from the bank";
    expect(apply(text, suggestion(15, 19, "form", "from"))).toBe(text);
  });

  it("changes nothing for an empty span", () => {
    expect(apply("short", suggestion(2, 2, "", "x"))).toBe("short");
  });

  it("changes nothing for a span that splits a surrogate pair", () => {
    const text = "😀 hi";
    expect(apply(text, suggestion(1, 2, text.slice(1, 2), "x"))).toBe(text);
    expect(apply(text, suggestion(0, 1, text.slice(0, 1), "x"))).toBe(text);
  });

  it("changes nothing when the span is outside the text", () => {
    const text = "short";
    expect(apply(text, suggestion(10, 14, "", "x"))).toBe(text);
    expect(apply(text, suggestion(3, 1, "", "x"))).toBe(text);
    expect(apply(text, suggestion(-1, 2, "", "x"))).toBe(text);
  });
});

describe("applyAll", () => {
  const at = (text: string, typed: string, replacement: string): Suggestion => {
    const start = text.indexOf(typed);
    return suggestion(start, start + typed.length, typed, replacement);
  };

  it("applies every suggestion, whatever order they come in, keeping everything else", () => {
    const text = "ذَهَبْتُ  الى المدرسه\nفي الرياظ";
    const all = [at(text, "الرياظ", "الرياض"), at(text, "الى", "إلى"), at(text, "المدرسه", "المدرسة")];
    expect(applyAll(text, all)).toBe("ذَهَبْتُ  إلى المدرسة\nفي الرياض");
  });

  it("handles replacements longer and shorter than the typed word", () => {
    const text = "I recieve teh letter";
    expect(applyAll(text, [at(text, "recieve", "received"), at(text, "teh", "a")])).toBe("I received a letter");
  });

  it("skips a suggestion that no longer holds its typed text and applies the rest", () => {
    const text = "a letter from the bank recieve";
    const stale = suggestion(9, 13, "form", "from");
    expect(applyAll(text, [stale, at(text, "recieve", "receive")])).toBe("a letter from the bank receive");
  });

  it("applies only the first of two overlapping suggestions", () => {
    const text = "a letter form the bank";
    const first = at(text, "form", "from");
    const overlapping = suggestion(first.start + 1, first.end, "orm", "xx");
    expect(applyAll(text, [first, overlapping])).toBe("a letter from the bank");
    expect(applyAll(text, [overlapping, first])).toBe("a letter fxx the bank");
  });

  it("returns the text unchanged with no suggestions", () => {
    expect(applyAll("نص", [])).toBe("نص");
  });
});
