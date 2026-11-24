import type { Lang, Run, Script } from "./types.js";

/**
 * Unicode ranges counted as Arabic: Arabic, Arabic Supplement, Arabic
 * Extended-B and Extended-A (adjacent, so one range), Presentation Forms-A and
 * Presentation Forms-B. Presentation Forms-B stops at U+FEFE: U+FEFF is the byte
 * order mark, a format character, so it is neutral. Everything in these blocks
 * counts, including diacritics, tatweel, Arabic punctuation and Arabic-Indic
 * digits. Arabic blocks outside the BMP (Extended-C, mathematical symbols) are
 * not counted.
 */
const ARABIC_RANGES: readonly (readonly [number, number])[] = [
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0x0870, 0x08ff],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfefe],
];

const hex = (code: number): string => code.toString(16).padStart(4, "0");

// No `u` flag on purpose: each match is one UTF-16 code unit, so replacing a
// match with one space keeps the length, and surrogate halves never match.
const ARABIC_CHAR = new RegExp(
  `[${ARABIC_RANGES.map(([lo, hi]) => `\\u${hex(lo)}-\\u${hex(hi)}`).join("")}]`,
  "g",
);
const LATIN_CHAR = /[A-Za-z]/g;

/** The script of one UTF-16 code unit. Latin is ASCII letters only. */
function scriptOf(code: number): Script {
  if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) return "en";
  for (const [lo, hi] of ARABIC_RANGES) {
    if (code >= lo && code <= hi) return "ar";
  }
  return "neutral";
}

/**
 * Splits text into Arabic and Latin runs. Neutral characters join the run
 * before them in reading order; neutral characters at the very start, before
 * any letter, form a neutral run of their own. Runs are contiguous and cover
 * the whole text.
 */
export function runs(text: string): Run[] {
  const result: Run[] = [];
  let current: Script | undefined;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const script = scriptOf(text.charCodeAt(i));
    if (current === undefined) {
      current = script;
    } else if (script !== "neutral" && script !== current) {
      result.push({ lang: current, start, end: i });
      current = script;
      start = i;
    }
  }
  if (current !== undefined) result.push({ lang: current, start, end: text.length });
  return result;
}

/**
 * Returns a copy of the text for one language's checker: every character of
 * the other language becomes a space. The copy has the same length, so every
 * span a checker finds in it is the same span in the original text.
 */
export function mask(text: string, lang: Lang): string {
  return text.replace(lang === "ar" ? LATIN_CHAR : ARABIC_CHAR, " ");
}
