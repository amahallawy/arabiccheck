// The whole path with the real models: page-side client → MessageChannel → serve() → both checkers.
import { MessageChannel, type MessagePort } from "node:worker_threads";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startModelServer, type ModelServer } from "../../../scripts/lib/model-server.js";
import { createCheckerClient, type CheckerClient } from "../src/client.js";
import type { MessageTarget, StatusMessage } from "../src/protocol.js";
import { serve } from "../src/serve.js";

let server: ModelServer;
beforeAll(async () => {
  server = await startModelServer();
});
afterAll(async () => {
  await server?.close();
});

const ports: MessagePort[] = [];
afterEach(() => {
  for (const port of ports.splice(0)) port.close();
});

/** Connects a client to a served "worker" over a real MessageChannel; resolves once both languages reported. */
async function connect(models: { en: string; ar: string }): Promise<{ client: CheckerClient; statuses: StatusMessage[] }> {
  const { port1, port2 } = new MessageChannel();
  ports.push(port1, port2);
  serve(port2 as unknown as MessageTarget, server.baseUrl);
  const client = createCheckerClient(port1 as unknown as MessageTarget, { models });
  port1.start();
  port2.start();
  const statuses: StatusMessage[] = [];
  await new Promise<void>((resolve) => {
    client.onStatus((status) => {
      statuses.push(status);
      if (statuses.length === 2) resolve();
    });
  });
  return { client, statuses };
}

describe("the worker with the real models", () => {
  it("checks mixed Arabic and English text, each part with its own checker, at the original offsets", async () => {
    const { client, statuses } = await connect({ en: "en/", ar: "ar/" });
    expect(statuses.map((s) => `${s.type}:${s.lang}`).sort()).toEqual(["ready:ar", "ready:en"]);

    const text = "ذهبت الى المدرسه في الرياظ\nI got a letter form the bank";
    const result = await client.check(text);
    expect(result?.errors).toEqual([]);
    expect(result?.suggestions.map((s) => [s.lang, s.typed, s.replacement])).toEqual([
      ["ar", "الى", "إلى"],
      ["ar", "المدرسه", "المدرسة"],
      ["ar", "الرياظ", "الرياض"],
      ["en", "form", "from"],
    ]);
    for (const s of result?.suggestions ?? []) expect(text.slice(s.start, s.end)).toBe(s.typed);
    expect(result?.timings.byLang).toHaveProperty("ar");
    expect(result?.timings.byLang).toHaveProperty("en");
  });

  it("drops the reply to a check that a newer one superseded", async () => {
    const { client } = await connect({ en: "en/", ar: "ar/" });
    const older = client.check("I got a letter form the bank");
    const newer = client.check("ذهبت الى المدرسه");
    expect(await older).toBeUndefined();
    expect((await newer)?.suggestions.map((s) => s.replacement)).toEqual(["إلى", "المدرسة"]);
  });

  it("reports the file a failed load names, and keeps checking the other language", async () => {
    const { client, statuses } = await connect({ en: "missing/", ar: "ar/" });
    expect(statuses).toContainEqual(expect.objectContaining({ type: "load-error", lang: "en", file: "words.txt" }));
    expect(statuses).toContainEqual(expect.objectContaining({ type: "ready", lang: "ar" }));

    const result = await client.check("ذهبت الى المدرسه and form");
    expect(result?.suggestions.map((s) => s.lang)).toEqual(["ar", "ar"]);
    expect(result?.errors).toEqual([]);
  });
});
