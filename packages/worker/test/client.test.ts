import { describe, expect, it } from "vitest";
import { createCheckerClient } from "../src/client.js";
import type { MessageTarget, ResultMessage } from "../src/protocol.js";

type Listener = (event: { readonly data?: unknown; readonly message?: unknown }) => void;

/** A fake worker: records what the client posts and lets the test reply or fail. */
function fakeWorker() {
  const sent: unknown[] = [];
  const listeners = new Map<string, Listener>();
  const target: MessageTarget = {
    postMessage: (message) => sent.push(message),
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  return {
    target,
    sent,
    reply: (data: unknown) => listeners.get("message")?.({ data }),
    crash: (message: string) => listeners.get("error")?.({ message }),
    garble: () => listeners.get("messageerror")?.({}),
  };
}

const result = (version: number): ResultMessage => ({
  type: "result",
  version,
  suggestions: [],
  timings: { totalMs: 1, byLang: {} },
  errors: [],
});

const MODELS = { models: { en: "/models/en/", ar: "/models/ar/" }, wasmPaths: "/ort/" };

describe("createCheckerClient", () => {
  it("sends init with the folders as soon as it is created", () => {
    const worker = fakeWorker();
    createCheckerClient(worker.target, MODELS);
    expect(worker.sent).toEqual([{ type: "init", ...MODELS }]);
  });

  it("sends each check with a new version and resolves it with its result", async () => {
    const worker = fakeWorker();
    const client = createCheckerClient(worker.target, MODELS);
    const pending = client.check("form", ["recieve"]);
    expect(worker.sent[1]).toEqual({ type: "check", version: 1, text: "form", ignored: ["recieve"] });
    worker.reply(result(1));
    expect(await pending).toEqual({ suggestions: [], timings: { totalMs: 1, byLang: {} }, errors: [] });
  });

  it("resolves a superseded check with undefined and ignores its late reply", async () => {
    const worker = fakeWorker();
    const client = createCheckerClient(worker.target, MODELS);
    const older = client.check("one");
    const newer = client.check("two");
    expect(await older).toBeUndefined();
    worker.reply(result(1)); // the reply to the superseded check arrives late
    worker.reply(result(2));
    expect(await newer).toMatchObject({ errors: [] });
    expect(worker.sent.filter((m) => (m as { type: string }).type === "check")).toHaveLength(2);
  });

  it("passes load status to listeners, replays it to late ones, and stops after unsubscribing", () => {
    const worker = fakeWorker();
    const client = createCheckerClient(worker.target, MODELS);
    const early: string[] = [];
    const stop = client.onStatus((status) => early.push(`${status.type}:${status.lang}`));
    worker.reply({ type: "ready", lang: "en", loadMs: 700 });
    stop();
    worker.reply({ type: "load-error", lang: "ar", file: "model.onnx", message: "404" });

    const late: string[] = [];
    client.onStatus((status) => late.push(`${status.type}:${status.lang}`));
    expect(early).toEqual(["ready:en"]);
    expect(late).toEqual(["ready:en", "load-error:ar"]);
  });

  it("when the worker dies, answers every check with an error and reports both languages failed", async () => {
    const worker = fakeWorker();
    const client = createCheckerClient(worker.target, MODELS);
    const statuses: string[] = [];
    client.onStatus((status) => statuses.push(`${status.type}:${status.lang}`));
    const waiting = client.check("form");
    worker.crash("Failed to fetch worker script");
    worker.crash("again"); // reported once

    const expected = {
      suggestions: [],
      timings: { totalMs: 0, byLang: {} },
      errors: [
        { lang: "ar", message: "the checker worker stopped: Failed to fetch worker script" },
        { lang: "en", message: "the checker worker stopped: Failed to fetch worker script" },
      ],
    };
    expect(await waiting).toEqual(expected);
    expect(await client.check("later")).toEqual(expected);
    expect(statuses).toEqual(["load-error:ar", "load-error:en"]);
    expect(worker.sent.filter((m) => (m as { type: string }).type === "check")).toHaveLength(1);
  });

  it("answers the waiting check with an error when its reply can't be read", async () => {
    const worker = fakeWorker();
    const client = createCheckerClient(worker.target, MODELS);
    const waiting = client.check("form");
    worker.garble();
    expect((await waiting)?.errors.map((e) => e.lang)).toEqual(["ar", "en"]);
    // The worker still works: the next check is sent and answered normally.
    const next = client.check("form");
    worker.reply(result(2));
    expect(await next).toMatchObject({ errors: [] });
  });

  it("ignores messages that aren't from the worker protocol, and results it didn't ask for", async () => {
    const worker = fakeWorker();
    const client = createCheckerClient(worker.target, MODELS);
    const pending = client.check("form");
    worker.reply("hello");
    worker.reply({ type: "unknown" });
    worker.reply({ type: "result", version: 1 }); // malformed: no suggestions, timings or errors
    worker.reply({ type: "ready", lang: "fr", loadMs: 1 }); // not a language we check
    worker.reply(result(99));
    worker.reply(result(1));
    expect(await pending).toMatchObject({ suggestions: [] });
  });
});
