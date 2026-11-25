import type { Checker } from "@arabiccheck/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CheckerLoaders } from "../src/handler.js";
import type { MessageTarget } from "../src/protocol.js";
import { serve } from "../src/serve.js";

const quiet: Checker = { id: "quiet", lang: "en", check: async () => [] };
const LOADERS: CheckerLoaders = { en: async () => quiet, ar: async () => ({ ...quiet, lang: "ar" }) };
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** A fake worker scope: lets the test send messages in and see what is posted back. */
function fakeScope(postMessage: (message: unknown) => void) {
  let listener: ((event: { readonly data: unknown }) => void) | undefined;
  const scope: MessageTarget = { postMessage, addEventListener: (_type, l) => (listener = l) };
  return { scope, send: (data: unknown) => listener?.({ data }) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("serve", () => {
  it("answers init and check messages on the scope", async () => {
    const posted: unknown[] = [];
    const { scope, send } = fakeScope((message) => posted.push(message));
    serve(scope, "http://x/", LOADERS);
    send({ type: "init", models: { en: "en/", ar: "ar/" } });
    send({ type: "check", version: 1, text: "hello" });
    await tick();
    expect(posted.map((m) => (m as { type: string }).type).sort()).toEqual(["ready", "ready", "result"]);
  });

  it("ignores messages that aren't part of the protocol", async () => {
    const posted: unknown[] = [];
    const { scope, send } = fakeScope((message) => posted.push(message));
    serve(scope, "http://x/", LOADERS);
    send("hello");
    send({ type: "nonsense" });
    await tick();
    expect(posted).toEqual([]);
  });

  it("logs an unexpected failure instead of swallowing it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { scope, send } = fakeScope(() => {
      throw new Error("channel closed");
    });
    serve(scope, "http://x/", LOADERS);
    send({ type: "check", version: 1, text: "hello" }); // posting its result throws
    await tick();
    expect(logged).toHaveBeenCalledWith("ArabicCheck worker:", expect.objectContaining({ message: "channel closed" }));
  });
});
