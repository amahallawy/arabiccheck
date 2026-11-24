import { describe, expect, it } from "vitest";
import { mask } from "../src/index.js";

const SAMPLES = [
  "",
  "hello",
  "مرحبا",
  "ذهبت الى المدرسه with recieve",
  "اشتريت iPhone جديد",
  "مَدْرَسَةٌ and كتـــاب",
  "٣٤ items, 12 كتاب 😀 done\nسطر جديد",
  "﻿ﻻ café",
];

describe("mask", () => {
  it("keeps the text length identical for every sample", () => {
    for (const text of SAMPLES) {
      expect(mask(text, "ar")).toHaveLength(text.length);
      expect(mask(text, "en")).toHaveLength(text.length);
    }
  });

  it("only ever replaces characters with spaces", () => {
    for (const text of SAMPLES) {
      for (const lang of ["ar", "en"] as const) {
        const masked = mask(text, lang);
        for (let i = 0; i < text.length; i++) {
          if (masked[i] !== text[i]) expect(masked[i]).toBe(" ");
        }
      }
    }
  });

  it("blanks Latin letters for the Arabic checker and keeps neutral characters", () => {
    expect(mask("كتاب book 12!", "ar")).toBe("كتاب      12!");
  });

  it("blanks Arabic letters, diacritics, tatweel and Arabic-Indic digits for the English checker", () => {
    const word = "مَدْرَسَة";
    expect(mask(`${word} book`, "en")).toBe(" ".repeat(word.length) + " book");
    expect(mask("كتـاب ٣ book", "en")).toBe(" ".repeat(7) + " book");
  });

  it("leaves Latin letters outside ASCII in both copies", () => {
    expect(mask("café", "ar")).toBe("   é");
    expect(mask("café", "en")).toBe("café");
  });

  it("leaves emoji and other neutral characters in both copies", () => {
    expect(mask("😀 hi", "ar")).toBe("😀   ");
    expect(mask("😀 هلا", "en")).toBe("😀    ");
  });

  it("keeps every offset valid in the original text", () => {
    const text = "ذهبت الى المدرسه with recieve";
    const en = mask(text, "en");
    const ar = mask(text, "ar");
    const enStart = en.indexOf("recieve");
    const arStart = ar.indexOf("المدرسه");
    expect(text.slice(enStart, enStart + 7)).toBe("recieve");
    expect(text.slice(arStart, arStart + 7)).toBe("المدرسه");
  });
});
