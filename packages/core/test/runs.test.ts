import { describe, expect, it } from "vitest";
import { runs } from "../src/index.js";

describe("runs", () => {
  it("returns no runs for empty text", () => {
    expect(runs("")).toEqual([]);
  });

  it("returns one Latin run for English text", () => {
    expect(runs("hello world")).toEqual([{ lang: "en", start: 0, end: 11 }]);
  });

  it("returns one Arabic run for Arabic text", () => {
    expect(runs("ذهبت إلى المدرسة")).toEqual([{ lang: "ar", start: 0, end: 16 }]);
  });

  it("joins neutral characters to the run before them in reading order", () => {
    // "مرحبا " is 6 code units, the space belongs to the Arabic run.
    expect(runs("مرحبا hello")).toEqual([
      { lang: "ar", start: 0, end: 6 },
      { lang: "en", start: 6, end: 11 },
    ]);
  });

  it("keeps leading neutral characters in a neutral run", () => {
    expect(runs("123 hello")).toEqual([
      { lang: "neutral", start: 0, end: 4 },
      { lang: "en", start: 4, end: 9 },
    ]);
  });

  it("returns one neutral run for text with no letters", () => {
    expect(runs("123 !? 45")).toEqual([{ lang: "neutral", start: 0, end: 9 }]);
  });

  it("splits an Arabic sentence around an English word inside it", () => {
    const text = "اشتريت iPhone جديد";
    expect(runs(text)).toEqual([
      { lang: "ar", start: 0, end: 7 },
      { lang: "en", start: 7, end: 14 },
      { lang: "ar", start: 14, end: 18 },
    ]);
  });

  it("splits mixed lines", () => {
    expect(runs("مرحبا\nhello")).toEqual([
      { lang: "ar", start: 0, end: 6 },
      { lang: "en", start: 6, end: 11 },
    ]);
  });

  it("keeps full diacritics (tashkeel) inside the Arabic run", () => {
    const text = "مَدْرَسَةٌ";
    expect(runs(text)).toEqual([{ lang: "ar", start: 0, end: text.length }]);
  });

  it("keeps tatweel inside the Arabic run", () => {
    const text = "كتـــاب";
    expect(runs(text)).toEqual([{ lang: "ar", start: 0, end: text.length }]);
  });

  it("treats Arabic-Indic digits as Arabic", () => {
    expect(runs("hello ٣")).toEqual([
      { lang: "en", start: 0, end: 6 },
      { lang: "ar", start: 6, end: 7 },
    ]);
    expect(runs("٣ كتب")).toEqual([{ lang: "ar", start: 0, end: 5 }]);
  });

  it("treats Western digits as neutral", () => {
    expect(runs("hello 3")).toEqual([{ lang: "en", start: 0, end: 7 }]);
    expect(runs("كتب 3")).toEqual([{ lang: "ar", start: 0, end: 5 }]);
  });

  it("treats Latin letters outside ASCII as neutral", () => {
    expect(runs("café")).toEqual([{ lang: "en", start: 0, end: 4 }]);
    expect(runs("é كتاب")).toEqual([
      { lang: "neutral", start: 0, end: 2 },
      { lang: "ar", start: 2, end: 6 },
    ]);
  });

  it.each([
    [0x05ff, "neutral"], // Hebrew
    [0x0600, "ar"],
    [0x06ff, "ar"],
    [0x0700, "neutral"], // Syriac
    [0x074f, "neutral"],
    [0x0750, "ar"], // Arabic Supplement
    [0x077f, "ar"],
    [0x0780, "neutral"], // Thaana
    [0x086f, "neutral"],
    [0x0870, "ar"], // Arabic Extended-B
    [0x08ff, "ar"], // end of Arabic Extended-A
    [0x0900, "neutral"], // Devanagari
    [0xfb4f, "neutral"],
    [0xfb50, "ar"], // Presentation Forms-A
    [0xfdff, "ar"],
    [0xfe6f, "neutral"],
    [0xfe70, "ar"], // Presentation Forms-B
    [0xfefe, "ar"],
    [0xfeff, "neutral"], // byte order mark
  ])("classifies U+%s at a block boundary", (code, lang) => {
    expect(runs(String.fromCharCode(code))).toEqual([{ lang, start: 0, end: 1 }]);
  });

  it("treats emoji as neutral and counts them in UTF-16 code units", () => {
    // "😀" is a surrogate pair: 2 code units.
    expect(runs("hi 😀 there")).toEqual([{ lang: "en", start: 0, end: 11 }]);
    expect(runs("😀 مرحبا")).toEqual([
      { lang: "neutral", start: 0, end: 3 },
      { lang: "ar", start: 3, end: 8 },
    ]);
  });

  it("treats Arabic presentation forms as Arabic", () => {
    // U+FEFB is the isolated lam-alef ligature (Presentation Forms-B).
    expect(runs("ﻻ")).toEqual([{ lang: "ar", start: 0, end: 1 }]);
  });

  it("treats the byte order mark as neutral, not Arabic", () => {
    // U+FEFF sits at the end of Presentation Forms-B but is a format character.
    expect(runs("﻿hello")).toEqual([
      { lang: "neutral", start: 0, end: 1 },
      { lang: "en", start: 1, end: 6 },
    ]);
  });

  it("covers the whole text with contiguous runs", () => {
    const text = "1) مرحبا, world! 😀 ٣٤ كتـاب\nnext line";
    const result = runs(text);
    expect(result[0]?.start).toBe(0);
    expect(result.at(-1)?.end).toBe(text.length);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]?.start).toBe(result[i - 1]?.end);
      expect(result[i]?.lang).not.toBe(result[i - 1]?.lang);
    }
  });
});
