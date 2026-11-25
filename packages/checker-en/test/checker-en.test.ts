import { readFileSync } from "node:fs";
import type { Fix, LoadOptions, Tinyfix } from "tinyfix";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startModelServer, type ModelServer } from "../../../scripts/lib/model-server.js";
import { CHECKER_ID, loadEnglishChecker, toSuggestions, type EnglishChecker } from "../src/index.js";

const fix = (overrides: Partial<Fix>): Fix => ({
  from: 0,
  to: 4,
  original: "form",
  replacement: "from",
  kind: "context",
  confidence: 0.9,
  ...overrides,
});

/** A stand-in for loadTinyfix that records its options and returns canned fixes. */
function fakeLoader(fixes: Fix[] = []) {
  const calls: { options?: LoadOptions } = {};
  const load = async (options: LoadOptions): Promise<Tinyfix> => {
    calls.options = options;
    return {
      check: async () => fixes,
      apply: () => "",
      fix: async () => "",
      ignore: () => {},
      dispose: async () => {},
    };
  };
  return { load, calls };
}

describe("toSuggestions", () => {
  it("maps a tinyfix fix onto a Suggestion", () => {
    expect(toSuggestions([fix({ from: 15, to: 19 })])).toEqual([
      {
        start: 15,
        end: 19,
        typed: "form",
        replacement: "from",
        lang: "en",
        kind: "real-word",
        score: 0.9,
        scoreKind: "confidence",
        checker: CHECKER_ID,
      },
    ]);
  });

  it("keeps spelling fixes as spelling", () => {
    expect(toSuggestions([fix({ kind: "spelling" })])[0]?.kind).toBe("spelling");
  });
});

describe("loadEnglishChecker", () => {
  it("uses careful mode unless told otherwise, and passes the folders through", async () => {
    const { load, calls } = fakeLoader();
    await loadEnglishChecker({ baseUrl: "http://x/models/en/", wasmPaths: "/ort/" }, load);
    expect(calls.options).toEqual({ baseUrl: "http://x/models/en/", mode: "careful", wasmPaths: "/ort/" });

    await loadEnglishChecker({ baseUrl: "http://x/", mode: "balanced" }, load);
    expect(calls.options).toEqual({ baseUrl: "http://x/", mode: "balanced" });
  });

  it("is an English checker whose id names the tinyfix version", async () => {
    const checker = await loadEnglishChecker({ baseUrl: "http://x/" }, fakeLoader([fix({})]).load);
    expect(checker).toMatchObject({ id: CHECKER_ID, lang: "en" });
    expect(await checker.check("form")).toHaveLength(1);
  });

  it("names the installed tinyfix version in its id", () => {
    const installed = JSON.parse(
      readFileSync(new URL("../../../node_modules/tinyfix/package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(CHECKER_ID).toBe(`tinyfix@${installed.version}`);
  });
});

describe("with the real model", () => {
  let server: ModelServer;
  let checker: EnglishChecker;
  beforeAll(async () => {
    server = await startModelServer();
    checker = await loadEnglishChecker({ baseUrl: `${server.baseUrl}en/` });
  });
  afterAll(async () => {
    await checker?.dispose();
    await server?.close();
  });

  it("fixes the real-word error in 'I got a letter form the bank'", async () => {
    const suggestions = await checker.check("I got a letter form the bank");
    expect(suggestions).toEqual([
      expect.objectContaining({ start: 15, end: 19, typed: "form", replacement: "from", kind: "real-word" }),
    ]);
  });

  it("fixes a misspelling and labels it spelling", async () => {
    const suggestions = await checker.check("I recieve letters");
    expect(suggestions).toEqual([
      expect.objectContaining({ typed: "recieve", replacement: "receive", kind: "spelling" }),
    ]);
  });

  it("leaves correct text alone", async () => {
    expect(await checker.check("I got a letter from the bank and received it.")).toEqual([]);
  });

  it("names the file when the model can't be loaded", async () => {
    await expect(loadEnglishChecker({ baseUrl: `${server.baseUrl}missing/` })).rejects.toThrow(/words\.txt/);
  });
});
