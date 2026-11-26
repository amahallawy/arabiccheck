import type { Suggestion } from "@arabiccheck/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkLine, debounce, kindLabel, moveOffset, paragraphs, shiftAfter, statusLine, visible } from "../src/view.ts";

const at = (text: string, typed: string, replacement: string, extra: Partial<Suggestion> = {}): Suggestion => {
  const start = text.indexOf(typed);
  return {
    start,
    end: start + typed.length,
    typed,
    replacement,
    lang: "ar",
    kind: "real-word",
    score: 2,
    scoreKind: "margin",
    checker: "test@0",
    ...extra,
  };
};

describe("paragraphs", () => {
  it("splits on line breaks and marks each suggestion in place, by its index", () => {
    const text = "ذهبت الى المدرسه\nI got a letter form the bank";
    const list = [at(text, "الى", "إلى"), at(text, "المدرسه", "المدرسة"), at(text, "form", "from", { lang: "en" })];
    expect(paragraphs(text, list)).toEqual([
      { start: 0, pieces: [{ text: "ذهبت " }, { text: "الى", mark: 0 }, { text: " " }, { text: "المدرسه", mark: 1 }] },
      { start: 17, pieces: [{ text: "I got a letter " }, { text: "form", mark: 2 }, { text: " the bank" }] },
    ]);
  });

  it("keeps empty lines as empty paragraphs, so the marked view lines up with the text box", () => {
    expect(paragraphs("a\n\nb", [])).toEqual([
      { start: 0, pieces: [{ text: "a" }] },
      { start: 2, pieces: [] },
      { start: 3, pieces: [{ text: "b" }] },
    ]);
  });

  it("treats \\r\\n as one break and keeps the \\r out of the text", () => {
    const text = "one\r\ntwo";
    expect(paragraphs(text, [at(text, "two", "too")])).toEqual([
      { start: 0, pieces: [{ text: "one" }] },
      { start: 5, pieces: [{ text: "two", mark: 0 }] },
    ]);
  });

  it("does not mark a suggestion that crosses a line break", () => {
    const text = "ab\ncd";
    const crossing: Suggestion = { ...at(text, "b\nc", "x") };
    expect(paragraphs(text, [crossing])).toEqual([
      { start: 0, pieces: [{ text: "ab" }] },
      { start: 3, pieces: [{ text: "cd" }] },
    ]);
  });

  it("counts offsets in UTF-16 code units, so a word after an emoji is marked exactly", () => {
    const text = "😀 recieve\n𝒜 teh";
    const list = [at(text, "recieve", "receive", { lang: "en" }), at(text, "teh", "the", { lang: "en" })];
    expect(paragraphs(text, list)).toEqual([
      { start: 0, pieces: [{ text: "😀 " }, { text: "recieve", mark: 0 }] },
      { start: 11, pieces: [{ text: "𝒜 " }, { text: "teh", mark: 1 }] },
    ]);
  });

  it("returns one empty paragraph for empty text", () => {
    expect(paragraphs("", [])).toEqual([{ start: 0, pieces: [] }]);
  });
});

describe("visible", () => {
  it("drops ignored words and suggestions whose word has since changed", () => {
    const old = "ذهبت الى المدرسه";
    const list = [at(old, "الى", "إلى"), at(old, "المدرسه", "المدرسة")];
    expect(visible(old, list, new Set(["الى"])).map((s) => s.typed)).toEqual(["المدرسه"]);
    expect(visible("ذهبت إلى المدرسه", list, new Set()).map((s) => s.typed)).toEqual(["المدرسه"]);
  });
});

describe("after accepting", () => {
  // "I recieve teh letter": recieve (2–9) → received (+1), teh (10–13) → a (−2)
  const text = "I recieve teh letter";
  const recieve = at(text, "recieve", "received", { lang: "en" });
  const teh = at(text, "teh", "a", { lang: "en" });

  it("moves an offset by the change in length of every replacement before it", () => {
    expect(moveOffset(0, [recieve, teh])).toBe(0);
    expect(moveOffset(9, [recieve])).toBe(10);
    expect(moveOffset(text.length, [recieve, teh])).toBe(text.length - 1);
  });

  it("moves an offset inside a replaced word to the end of its replacement", () => {
    expect(moveOffset(5, [recieve])).toBe(2 + "received".length);
  });

  it.each([
    ["at the start of a replaced word: stays", 2, [recieve], 2],
    ["at the end of a replaced word: after the replacement", 9, [recieve], 10],
    ["between two replacements: moved by the first only", 10, [recieve, teh], 11],
    ["at the end of the second: moved by both", 13, [recieve, teh], 12],
    ["inside the second, after the first: end of the second replacement", 11, [recieve, teh], 12],
  ] as const)("moves an offset %s", (_name, offset, applied, expected) => {
    expect(moveOffset(offset, applied)).toBe(expected);
  });

  it("shifts the suggestions left and drops any that overlapped what was applied", () => {
    const overlapping = at(text, "eve", "x", { lang: "en" });
    expect(shiftAfter([teh, overlapping], [recieve])).toEqual([{ ...teh, start: 11, end: 14 }]);
    expect(shiftAfter([recieve], [teh])).toEqual([recieve]);
  });

  it("keeps a suggestion that touches an applied one without overlapping it", () => {
    const joined = "ab";
    const a = at(joined, "a", "xyz");
    const b = at(joined, "b", "c");
    expect(shiftAfter([b], [a])).toEqual([{ ...b, start: 3, end: 4 }]);
  });
});

describe("kindLabel", () => {
  it("names the kind, and the Arabic edit kind when there is one", () => {
    expect(kindLabel(at("x", "x", "y", { kind: "spelling", lang: "en" }))).toBe("spelling");
    expect(kindLabel(at("x", "x", "y", { detail: "hamza" }))).toBe("real-word · hamza");
    expect(kindLabel(at("x", "x", "y", { detail: "taa_marbuta" }))).toBe("real-word · taa marbuta");
    expect(kindLabel(at("x", "x", "y", { detail: "alif_maqsura" }))).toBe("real-word · alef maqsura");
    expect(kindLabel(at("x", "x", "y", { detail: "sound_alike" }))).toBe("real-word · sound-alike letter");
  });

  it("shows an unknown edit kind readably and leaves out the uninformative ones", () => {
    expect(kindLabel(at("x", "x", "y", { detail: "new_kind" }))).toBe("real-word · new kind");
    expect(kindLabel(at("x", "x", "y", { detail: "other" }))).toBe("real-word");
    expect(kindLabel(at("x", "x", "y", { detail: "typed" }))).toBe("real-word");
  });
});

describe("statusLine", () => {
  it("says each model is loading until it reports", () => {
    expect(statusLine([])).toBe("Arabic model: loading… · English model: loading…");
  });

  it("gives each model's load time, or the file that failed", () => {
    expect(
      statusLine([
        { type: "ready", lang: "en", loadMs: 712.4 },
        { type: "load-error", lang: "ar", file: "model.onnx", message: "HTTP 404" },
      ]),
    ).toBe("Arabic model: failed to load model.onnx (HTTP 404) · English model: loaded in 712 ms");
  });

  it("gives the message alone when no file is named", () => {
    expect(statusLine([{ type: "load-error", lang: "en", message: "out of memory" }])).toBe(
      "Arabic model: loading… · English model: failed to load (out of memory)",
    );
  });
});

describe("checkLine", () => {
  it("says nothing has been checked yet", () => {
    expect(checkLine(undefined)).toBe("Last check: none yet");
  });

  it("gives the total and each language's time", () => {
    expect(checkLine({ suggestions: [], timings: { totalMs: 41.6, byLang: { ar: 30.2, en: 9.9 } }, errors: [] })).toBe(
      "Last check: 42 ms (Arabic 30 ms, English 10 ms)",
    );
    expect(checkLine({ suggestions: [], timings: { totalMs: 3, byLang: {} }, errors: [] })).toBe("Last check: 3 ms");
  });

  it("adds any language whose check failed", () => {
    const result = { suggestions: [], timings: { totalMs: 12, byLang: { en: 11 } }, errors: [{ lang: "ar" as const, message: "boom" }] };
    expect(checkLine(result)).toBe("Last check: 12 ms (English 11 ms) · Arabic check failed: boom");
  });
});

describe("debounce", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs once, with the latest arguments, after the input has been quiet for the delay", () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const run = debounce((text: string) => calls.push(text), 250);
    run("a");
    vi.advanceTimersByTime(200);
    run("ab");
    vi.advanceTimersByTime(200);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(50);
    expect(calls).toEqual(["ab"]);
  });

  it("can run at once, cancelling what was waiting", () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const run = debounce((text: string) => calls.push(text), 250);
    run("a");
    run.now("b");
    vi.advanceTimersByTime(500);
    expect(calls).toEqual(["b"]);
  });
});
