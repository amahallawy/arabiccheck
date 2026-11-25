import { describe, expect, it } from "vitest";
import { parseCases, parseManifest, tokens } from "../src/sets.ts";

const line = (fields: Record<string, unknown>): string =>
  JSON.stringify({ id: "x1", lang: "en", text: "a letter form the bank", expected: "a letter from the bank", source: "seed", ...fields });

describe("tokens", () => {
  it("splits on any whitespace and ignores leading and trailing space", () => {
    expect(tokens("  ذهبت الى\tالمدرسه\n اليوم ")).toEqual(["ذهبت", "الى", "المدرسه", "اليوم"]);
    expect(tokens("")).toEqual([]);
  });
});

describe("parseCases", () => {
  it("reads one case per non-empty line", () => {
    const cases = parseCases(`${line({})}\n\n${line({ id: "x2" })}\n`, "en-errors", "errors");
    expect(cases.map((c) => c.id)).toEqual(["x1", "x2"]);
    expect(cases[0]).toEqual({
      id: "x1",
      lang: "en",
      text: "a letter form the bank",
      expected: "a letter from the bank",
      source: "seed",
    });
  });

  it.each<[string, string, RegExp]>([
    ["invalid JSON", "{ nope", /en-errors:1: not valid JSON/],
    ["a missing field", JSON.stringify({ id: "x1", lang: "en", text: "a", expected: "a" }), /en-errors:1: source/],
    ["an unknown language", line({ lang: "fr" }), /en-errors:1: lang must be "ar" or "en"/],
    ["a different token count", line({ expected: "a letter from bank" }), /en-errors:1: text has 5 tokens but expected has 4/],
    ["an empty text", line({ text: " ", expected: " " }), /en-errors:1: text is empty/],
  ])("rejects %s, naming the set and line", (_label, content, message) => {
    expect(() => parseCases(content, "en-errors", "errors")).toThrow(message);
  });

  it("rejects a duplicate id", () => {
    expect(() => parseCases(`${line({})}\n${line({})}`, "en-errors", "errors")).toThrow(/en-errors:2: duplicate id x1/);
  });

  it("requires every case in a clean set to expect no change", () => {
    expect(() => parseCases(line({}), "en-clean", "clean")).toThrow(/en-clean:1: a clean set's expected must equal its text/);
    expect(parseCases(line({ text: "fine", expected: "fine" }), "en-clean", "clean")).toHaveLength(1);
  });
});

describe("parseManifest", () => {
  const entry = {
    name: "ar-errors",
    file: "ar-errors.jsonl",
    lang: "ar",
    kind: "errors",
    source: "Drafted by Claude for ArabicCheck",
    licence: "MIT",
  };

  it("reads the sets and their review state", () => {
    const reviewed = { ...entry, name: "ar-clean", file: "ar-clean.jsonl", kind: "clean", reviewed: { by: "owner", on: "2026-11-26" } };
    expect(parseManifest([entry, reviewed])).toEqual([entry, reviewed]);
  });

  it.each<[string, unknown, RegExp]>([
    ["not a list", {}, /sets\.json must be a list/],
    ["a bad kind", [{ ...entry, kind: "mixed" }], /sets\.json\[0\]: kind must be "errors" or "clean"/],
    ["a file outside the folder", [{ ...entry, file: "../x.jsonl" }], /sets\.json\[0\]: file must be a plain \.jsonl file name/],
    ["a duplicate name", [entry, entry], /sets\.json\[1\]: duplicate name ar-errors/],
    ["a malformed review", [{ ...entry, reviewed: { by: "owner", on: "26/11/2026" } }], /sets\.json\[0\]: reviewed must be/],
  ])("rejects %s", (_label, value, message) => {
    expect(() => parseManifest(value)).toThrow(message);
  });
});
