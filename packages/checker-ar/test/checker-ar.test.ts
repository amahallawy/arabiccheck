import { readFileSync } from "node:fs";
import type { Change, LoadOptions, TinyfixAr, WordJudgement } from "tinyfix-ar";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startModelServer, type ModelServer } from "../../../test/support/model-server.js";
import { CHECKER_ID, loadArabicChecker, toSuggestions, type ArabicChecker } from "../src/index.js";

const change = (overrides: Partial<Change> = {}): Change => ({
  start: 5,
  end: 8,
  typed: "الى",
  replacement: "إلى",
  margin: 15.5,
  ...overrides,
});

const judgement = (overrides: Partial<WordJudgement> = {}): WordJudgement => ({
  start: 5,
  end: 8,
  typed: "الى",
  best: "إلى",
  margin: 15.5,
  kind: "hamza",
  misspelled: true,
  changes: true,
  ...overrides,
});

/** A stand-in for loadTinyfixAr that records its options and counts calls. */
function fakeLoader(changes: Change[], judgements: WordJudgement[]) {
  const calls = { judge: 0, options: undefined as LoadOptions | undefined };
  const load = async (options: LoadOptions): Promise<TinyfixAr> => {
    calls.options = options;
    return {
      fix: async (text) => ({ text, changes }),
      judge: async () => {
        calls.judge++;
        return judgements;
      },
      dispose: async () => {},
    };
  };
  return { load, calls };
}

describe("toSuggestions", () => {
  it("takes the change from fix() and the edit kind from the judgement with the same span", () => {
    expect(toSuggestions([change()], [judgement({ start: 0, end: 4, kind: "typo" }), judgement()])).toEqual([
      {
        start: 5,
        end: 8,
        typed: "الى",
        replacement: "إلى",
        lang: "ar",
        kind: "spelling",
        detail: "hamza",
        score: 15.5,
        scoreKind: "margin",
        checker: CHECKER_ID,
      },
    ]);
  });

  it("calls a change to a real word real-word", () => {
    expect(toSuggestions([change()], [judgement({ misspelled: false })])[0]?.kind).toBe("real-word");
  });

  it("leaves out the edit kind when the judgement's best word is not the replacement", () => {
    const [suggestion] = toSuggestions([change()], [judgement({ best: "الي", misspelled: true })]);
    expect(suggestion).not.toHaveProperty("detail");
    expect(suggestion?.kind).toBe("spelling"); // misspelled describes the typed word, so it still holds
  });

  it("falls back to real-word with no detail when no judgement matches the span", () => {
    const [suggestion] = toSuggestions([change()], []);
    expect(suggestion?.kind).toBe("real-word");
    expect(suggestion).not.toHaveProperty("detail");
  });
});

describe("loadArabicChecker", () => {
  it("passes the folders through and skips judge() when there is nothing to change", async () => {
    const { load, calls } = fakeLoader([], [judgement()]);
    const checker = await loadArabicChecker({ baseUrl: "http://x/models/ar/", wasmPaths: "/ort/" }, load);
    expect(calls.options).toEqual({ baseUrl: "http://x/models/ar/", wasmPaths: "/ort/" });
    expect(checker).toMatchObject({ id: CHECKER_ID, lang: "ar" });
    expect(await checker.check("نص سليم")).toEqual([]);
    expect(calls.judge).toBe(0);
  });

  it("names the installed tinyfix-ar version in its id", () => {
    const installed = JSON.parse(
      readFileSync(new URL("../../../node_modules/tinyfix-ar/package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(CHECKER_ID).toBe(`tinyfix-ar@${installed.version}`);
  });
});

describe("with the real model", () => {
  let server: ModelServer;
  let checker: ArabicChecker;
  beforeAll(async () => {
    server = await startModelServer();
    checker = await loadArabicChecker({ baseUrl: `${server.baseUrl}ar/` });
  });
  afterAll(async () => {
    await checker?.dispose();
    await server?.close();
  });

  it("fixes 'ذهبت الى المدرسه في الرياظ' with إلى, المدرسة and الرياض and their edit kinds", async () => {
    const suggestions = await checker.check("ذهبت الى المدرسه في الرياظ");
    expect(suggestions.map(({ typed, replacement, kind, detail }) => ({ typed, replacement, kind, detail }))).toEqual([
      { typed: "الى", replacement: "إلى", kind: "spelling", detail: "hamza" },
      { typed: "المدرسه", replacement: "المدرسة", kind: "spelling", detail: "taa_marbuta" },
      { typed: "الرياظ", replacement: "الرياض", kind: "spelling", detail: "sound_alike" },
    ]);
    expect(suggestions.map((s) => [s.start, s.end])).toEqual([
      [5, 8],
      [9, 16],
      [20, 26],
    ]);
  });

  it("leaves correct text alone", async () => {
    expect(await checker.check("ذهبت إلى المدرسة في الرياض")).toEqual([]);
  });

  it("names the file when the model can't be loaded", async () => {
    await expect(loadArabicChecker({ baseUrl: `${server.baseUrl}missing/` })).rejects.toThrow(/manifest\.json/);
  });
});
