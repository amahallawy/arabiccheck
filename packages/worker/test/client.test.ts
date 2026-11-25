import { describe, expect, it } from "vitest";
import { createCheckerClient } from "../src/client.js";
import type { MessageTarget, ResultMessage } from "../src/protocol.js";

/** A fake worker: records what the client posts and lets the test reply. */
function fakeWorker() {
  const sent: unknown[] = [];
  let listener: ((event: { readonly data: unknown }) => void) | undefined;
  const target: MessageTarget = {
    postMessage: (message) => sent.push(message),
    addEventListener: (_type, l) => (listener = l),
  };
  return { target, sent, reply: (data: unknown) => listener?.({ data }) };
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

  it("ignores messages that aren't from the worker protocol, and results it didn't ask for", async () => {
    const worker = fakeWorker();
    const client = createCheckerClient(worker.target, MODELS);
    const pending = client.check("form");
    worker.reply("hello");
    worker.reply({ type: "unknown" });
    worker.reply(result(99));
    worker.reply(result(1));
    expect(await pending).toMatchObject({ suggestions: [] });
  });
});
