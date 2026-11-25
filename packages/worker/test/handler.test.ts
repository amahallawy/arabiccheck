import type { Checker, Lang, Suggestion } from "@arabiccheck/core";
import { describe, expect, it } from "vitest";
import { createHandler, type CheckerLoaders } from "../src/handler.js";
import type { FromWorker, InitMessage, ResultMessage } from "../src/protocol.js";

const INIT: InitMessage = { type: "init", models: { en: "/models/en/", ar: "/models/ar/" } };

/** Lets every pending promise callback run. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** A fake checker that suggests `replacement` for every occurrence of `word`, and records what it was given. */
function fakeChecker(lang: Lang, word: string, replacement: string, score = 0.9) {
  const seen: string[] = [];
  let gate: Promise<void> = Promise.resolve();
  const checker: Checker & { seen: string[]; hold(): () => void } = {
    id: `fake-${lang}`,
    lang,
    seen,
    hold() {
      let release!: () => void;
      gate = new Promise((resolve) => (release = resolve));
      return release;
    },
    async check(text): Promise<Suggestion[]> {
      seen.push(text);
      await gate;
      const out: Suggestion[] = [];
      for (let i = text.indexOf(word); i !== -1; i = text.indexOf(word, i + 1)) {
        out.push({
          start: i,
          end: i + word.length,
          typed: word,
          replacement,
          lang,
          kind: "real-word",
          score,
          scoreKind: lang === "en" ? "confidence" : "margin",
          checker: checker.id,
        });
      }
      return out;
    },
  };
  return checker;
}

function setup(loaders: Partial<CheckerLoaders> = {}) {
  const en = fakeChecker("en", "form", "from");
  const ar = fakeChecker("ar", "الى", "إلى", 5);
  const posted: FromWorker[] = [];
  const handler = createHandler(
    { en: async () => en, ar: async () => ar, ...loaders },
    (message) => posted.push(message),
  );
  const results = () => posted.filter((m): m is ResultMessage => m.type === "result");
  return { en, ar, posted, results, handler };
}

describe("createHandler", () => {
  it("loads both languages on init and reports each as ready", async () => {
    const { handler, posted } = setup();
    await handler.handle(INIT);
    expect(posted.filter((m) => m.type === "ready").map((m) => m.type === "ready" && m.lang).sort()).toEqual([
      "ar",
      "en",
    ]);
  });

  it("gives each checker only its own language, at the same offsets", async () => {
    const { handler, en, ar, results } = setup();
    await handler.handle(INIT);
    const text = "ذهبت الى the form";
    await handler.handle({ type: "check", version: 1, text });
    expect(en.seen).toEqual(["         the form"]);
    expect(ar.seen).toEqual(["ذهبت الى         "]);
    expect(results()[0]?.suggestions.map((s) => [s.start, s.replacement])).toEqual([
      [5, "إلى"],
      [13, "from"],
    ]);
  });

  it("skips a language with no characters in the text", async () => {
    const { handler, en, ar } = setup();
    await handler.handle(INIT);
    await handler.handle({ type: "check", version: 1, text: "ذهبت الى" });
    expect(en.seen).toEqual([]);
    expect(ar.seen).toHaveLength(1);
  });

  it("drops suggestions for ignored words", async () => {
    const { handler, results } = setup();
    await handler.handle(INIT);
    await handler.handle({ type: "check", version: 1, text: "form الى", ignored: ["form"] });
    expect(results()[0]?.suggestions.map((s) => s.typed)).toEqual(["الى"]);
  });

  it("reports a failed load with the file it names, and keeps checking the other language", async () => {
    const { handler, posted, results } = setup({
      en: async () => {
        throw new Error("tinyfix couldn't load words.txt from http://x/models/en/ (404).");
      },
    });
    await handler.handle(INIT);
    expect(posted).toContainEqual({
      type: "load-error",
      lang: "en",
      file: "words.txt",
      message: "tinyfix couldn't load words.txt from http://x/models/en/ (404).",
    });
    await handler.handle({ type: "check", version: 1, text: "form الى" });
    expect(results()[0]?.suggestions.map((s) => s.lang)).toEqual(["ar"]);
    expect(results()[0]?.errors).toEqual([]);
  });

  it("turns a loader that throws synchronously into a load-error for that language only", async () => {
    const { handler, posted, results } = setup({
      en: () => {
        throw new TypeError("Failed to construct 'URL': Invalid URL");
      },
    });
    await handler.handle(INIT);
    expect(posted).toContainEqual(expect.objectContaining({ type: "load-error", lang: "en" }));
    expect(posted).toContainEqual(expect.objectContaining({ type: "ready", lang: "ar" }));
    await handler.handle({ type: "check", version: 1, text: "الى" });
    expect(results()[0]?.suggestions).toHaveLength(1);
  });

  it("still answers, with an error, when merging the suggestions fails", async () => {
    const corrupt: Checker = {
      id: "corrupt",
      lang: "en",
      check: async () => [null as unknown as Suggestion], // not a suggestion: merge() throws on it
    };
    const { handler, results } = setup({ en: async () => corrupt });
    await handler.handle(INIT);
    await handler.handle({ type: "check", version: 1, text: "form" });
    expect(results()[0]).toMatchObject({ version: 1, suggestions: [] });
    expect(results()[0]?.errors.map((e) => e.lang)).toEqual(["ar", "en"]);
    expect(results()[0]?.errors[0]?.message).toMatch(/^merging suggestions failed: /);
  });

  it("keeps answering after a check fails unexpectedly", async () => {
    const posted: FromWorker[] = [];
    let failNext = true;
    const handler = createHandler(
      { en: async () => fakeChecker("en", "form", "from"), ar: async () => fakeChecker("ar", "x", "y") },
      (message) => {
        if (message.type === "result" && failNext) {
          failNext = false;
          throw new Error("channel closed");
        }
        posted.push(message);
      },
    );
    await handler.handle(INIT);
    await expect(handler.handle({ type: "check", version: 1, text: "form" })).rejects.toThrow("channel closed");
    await handler.handle({ type: "check", version: 2, text: "form" });
    expect(posted.filter((m) => m.type === "result").map((m) => m.type === "result" && m.version)).toEqual([2]);
  });

  it("answers only the newest check when several wait on a slow load", async () => {
    let finish!: () => void;
    const en = fakeChecker("en", "form", "from");
    const { handler, results } = setup({
      en: () => new Promise<Checker>((resolve) => (finish = () => resolve(en))),
    });
    const init = handler.handle(INIT);
    const first = handler.handle({ type: "check", version: 1, text: "form one" });
    await tick(); // version 1 is waiting on the English load
    const second = handler.handle({ type: "check", version: 2, text: "form two" });
    finish();
    await Promise.all([init, first, second]);
    expect(results().map((r) => r.version)).toEqual([2]);
  });

  it("reports a load failure that names no file without a file field", async () => {
    const { handler, posted } = setup({ ar: async () => Promise.reject("boom") });
    await handler.handle(INIT);
    expect(posted).toContainEqual({ type: "load-error", lang: "ar", message: "boom" });
  });

  it("reports a check that throws, and still returns the other language's suggestions", async () => {
    const broken: Checker = {
      id: "broken",
      lang: "ar",
      check: async () => {
        throw new Error("session failed");
      },
    };
    const { handler, results } = setup({ ar: async () => broken });
    await handler.handle(INIT);
    await handler.handle({ type: "check", version: 1, text: "form الى" });
    expect(results()[0]?.suggestions.map((s) => s.lang)).toEqual(["en"]);
    expect(results()[0]?.errors).toEqual([{ lang: "ar", message: "session failed" }]);
  });

  it("runs checks one at a time and skips any a newer request has overtaken", async () => {
    const { handler, en, results } = setup();
    await handler.handle(INIT);
    const release = en.hold();
    const first = handler.handle({ type: "check", version: 1, text: "form one" });
    await tick(); // version 1 is now running, held inside the checker
    const second = handler.handle({ type: "check", version: 2, text: "form two" });
    const third = handler.handle({ type: "check", version: 3, text: "form three" });
    await tick();
    expect(en.seen).toEqual(["form one"]); // the others wait their turn
    release();
    await Promise.all([first, second, third]);
    expect(en.seen).toEqual(["form one", "form three"]); // version 2 was overtaken while queued
    expect(results().map((r) => r.version)).toEqual([3]); // version 1 finished after 3 was sent
  });

  it("skips a queued check outright when a newer one arrives before it starts", async () => {
    const { handler, en, results } = setup();
    await handler.handle(INIT);
    await Promise.all([
      handler.handle({ type: "check", version: 1, text: "form one" }),
      handler.handle({ type: "check", version: 2, text: "form two" }),
    ]);
    expect(en.seen).toEqual(["form two"]);
    expect(results().map((r) => r.version)).toEqual([2]);
  });

  it("waits for loading to finish before the first check", async () => {
    let finish!: () => void;
    const en = fakeChecker("en", "form", "from");
    const { handler, results } = setup({
      en: () => new Promise<Checker>((resolve) => (finish = () => resolve(en))),
    });
    const init = handler.handle(INIT);
    const check = handler.handle({ type: "check", version: 1, text: "form" });
    await tick(); // loaders start asynchronously
    finish();
    await Promise.all([init, check]);
    expect(results()[0]?.suggestions).toHaveLength(1);
  });

  it("answers a check sent before init with an error for each language", async () => {
    const { handler, results } = setup();
    await handler.handle({ type: "check", version: 1, text: "form الى" });
    expect(results()[0]).toMatchObject({ version: 1, suggestions: [] });
    expect(results()[0]?.errors.map((e) => e.lang).sort()).toEqual(["ar", "en"]);
  });

  it("ignores a second init", async () => {
    let loads = 0;
    const { handler } = setup({
      en: async () => {
        loads++;
        return fakeChecker("en", "x", "y");
      },
    });
    await handler.handle(INIT);
    await handler.handle(INIT);
    expect(loads).toBe(1);
  });

  it("reports load time, and check time per language and in total", async () => {
    let clock = 0;
    const posted: FromWorker[] = [];
    const handler = createHandler(
      { en: async () => fakeChecker("en", "form", "from"), ar: async () => fakeChecker("ar", "x", "y") },
      (message) => posted.push(message),
      () => (clock += 10), // every reading of the clock is 10 ms later
    );
    await handler.handle(INIT);
    await handler.handle({ type: "check", version: 1, text: "form" });
    expect(posted.filter((m) => m.type === "ready").every((m) => m.type === "ready" && m.loadMs > 0)).toBe(true);
    const result = posted.find((m): m is ResultMessage => m.type === "result");
    expect(result?.timings.byLang).toEqual({ en: 10 });
    expect(result?.timings.totalMs).toBeGreaterThan(10);
  });
});
