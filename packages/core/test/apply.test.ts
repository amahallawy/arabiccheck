import { describe, expect, it } from "vitest";
import { apply, type Suggestion } from "../src/index.js";

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
