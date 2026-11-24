import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Lock } from "../lib/lock.ts";
import { syncModels, type Fetch } from "../lib/sync.ts";

const REV = "8efdf5cd91b32584f4077aa0e8ecaf48f7651bef";
const SOURCE = "https://huggingface.co/owner/model";
const url = (name: string): string => `${SOURCE}/resolve/${REV}/${name}`;
const sha = (bytes: string): string => createHash("sha256").update(bytes).digest("hex");

const CONTENT: Record<string, string> = { "a.txt": "alpha\n", "b.onnx": "bravo-bytes" };

function lockFor(files: Record<string, string>): Lock {
  return {
    schema: 1,
    sets: [
      {
        id: "en",
        package: "pkg@1.0.0",
        source: SOURCE,
        revision: REV,
        license: "MIT",
        files: Object.entries(files).map(([name, body]) => ({
          name,
          url: url(name),
          size: Buffer.byteLength(body),
          sha256: sha(body),
        })),
      },
    ],
  };
}

/** A fake network: serves `served` by URL and records every URL asked for. */
function fakeFetch(served: Record<string, string>, status = 200): Fetch & { calls: string[] } {
  const calls: string[] = [];
  const fetch = async (u: string): Promise<Response> => {
    calls.push(u);
    const name = u.split("/").at(-1) ?? "";
    const body = served[name];
    if (body === undefined) return new Response("missing", { status: 404 });
    return new Response(body, { status });
  };
  return Object.assign(fetch, { calls });
}

let out: string;
beforeEach(async () => {
  out = await mkdtemp(join(tmpdir(), "arabiccheck-sync-"));
});
afterEach(async () => {
  await rm(out, { recursive: true, force: true });
});

const read = (name: string): Promise<string> => readFile(join(out, "en", name), "utf8");

describe("syncModels", () => {
  it("downloads every missing file into <out>/<set>/<name> and verifies it", async () => {
    const fetch = fakeFetch(CONTENT);
    const result = await syncModels(lockFor(CONTENT), { outDir: out, fetch });
    expect(await read("a.txt")).toBe("alpha\n");
    expect(await read("b.onnx")).toBe("bravo-bytes");
    expect(result).toMatchObject({ downloaded: 2, kept: 0, changed: [] });
  });

  it("keeps a file already on disk with the right hash, without downloading it", async () => {
    await mkdir(join(out, "en"), { recursive: true });
    await writeFile(join(out, "en", "a.txt"), "alpha\n");
    const fetch = fakeFetch(CONTENT);
    const result = await syncModels(lockFor(CONTENT), { outDir: out, fetch });
    expect(fetch.calls).toEqual([url("b.onnx")]);
    expect(result).toMatchObject({ downloaded: 1, kept: 1 });
  });

  it("replaces a file on disk whose content is wrong", async () => {
    await mkdir(join(out, "en"), { recursive: true });
    await writeFile(join(out, "en", "a.txt"), "tampered");
    await syncModels(lockFor(CONTENT), { outDir: out, fetch: fakeFetch(CONTENT) });
    expect(await read("a.txt")).toBe("alpha\n");
  });

  it("fails on a hash mismatch, names the file, and leaves no file behind", async () => {
    await mkdir(join(out, "en"), { recursive: true });
    await writeFile(join(out, "en", "a.txt"), "stale");
    const served = { ...CONTENT, "a.txt": "ALPHA\n" }; // same size, different bytes
    await expect(
      syncModels(lockFor(CONTENT), { outDir: out, fetch: fakeFetch(served) }),
    ).rejects.toThrow(/en\/a\.txt.*sha256/);
    expect(existsSync(join(out, "en", "a.txt"))).toBe(false);
    expect(await readdir(join(out, "en"))).toEqual([]); // no .partial either
  });

  it("fails on a size mismatch", async () => {
    const served = { ...CONTENT, "b.onnx": "bravo-bytes-and-more" };
    await expect(
      syncModels(lockFor(CONTENT), { outDir: out, fetch: fakeFetch(served) }),
    ).rejects.toThrow(/en\/b\.onnx.*size/);
  });

  it("fails on a body smaller than the locked size", async () => {
    await expect(
      syncModels(lockFor(CONTENT), { outDir: out, fetch: fakeFetch({ ...CONTENT, "b.onnx": "bravo" }) }),
    ).rejects.toThrow(/en\/b\.onnx: size is 5 bytes, the lock says 11/);
  });

  it("stops reading a body that is bigger than the locked size", async () => {
    const huge = "x".repeat(1000);
    await expect(
      syncModels(lockFor(CONTENT), { outDir: out, fetch: fakeFetch({ ...CONTENT, "a.txt": huge }) }),
    ).rejects.toThrow(/en\/a\.txt: size is over 6 bytes/);
    expect(await readdir(join(out, "en"))).toEqual([]);
  });

  it("refuses a declared Content-Length over the limit before reading the body", async () => {
    let bodyRead = false;
    // highWaterMark 0: the stream pulls only when someone reads it.
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          bodyRead = true;
          controller.enqueue(new TextEncoder().encode("alpha\n"));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const fetch: Fetch = async () =>
      new Response(body, { headers: { "content-length": "999999999" } });
    await expect(syncModels(lockFor(CONTENT), { outDir: out, fetch })).rejects.toThrow(/size is over/);
    expect(bodyRead).toBe(false);
  });

  it("refuses an empty response", async () => {
    await expect(
      syncModels(lockFor(CONTENT), { outDir: out, fetch: fakeFetch({ ...CONTENT, "a.txt": "" }) }),
    ).rejects.toThrow(/en\/a\.txt: empty response/);
  });

  it("with relock, still caps the size of each file", async () => {
    await expect(
      syncModels(lockFor(CONTENT), {
        outDir: out,
        fetch: fakeFetch(CONTENT),
        relock: true,
        relockMaxBytes: 8, // b.onnx is 11 bytes
      }),
    ).rejects.toThrow(/en\/b\.onnx: size is over the 8-byte limit for --relock/);
  });

  it("fails on an HTTP error, naming the URL and status", async () => {
    await expect(
      syncModels(lockFor(CONTENT), { outDir: out, fetch: fakeFetch(CONTENT, 503) }),
    ).rejects.toThrow(/503.*a\.txt/);
  });

  it("fails on a network error, naming the URL and the underlying cause", async () => {
    const tls = Object.assign(new Error("self-signed certificate in certificate chain"), {
      code: "SELF_SIGNED_CERT_IN_CHAIN",
    });
    const fetch: Fetch = async () => {
      throw new TypeError("fetch failed", { cause: tls });
    };
    await expect(syncModels(lockFor(CONTENT), { outDir: out, fetch })).rejects.toThrow(
      /a\.txt: fetch failed \(SELF_SIGNED_CERT_IN_CHAIN\)/,
    );
  });

  it("leaves no partial files behind", async () => {
    await syncModels(lockFor(CONTENT), { outDir: out, fetch: fakeFetch(CONTENT) });
    expect((await readdir(join(out, "en"))).sort()).toEqual(["a.txt", "b.onnx"]);
  });

  it("returns the lock unchanged when not relocking", async () => {
    const lock = lockFor(CONTENT);
    const result = await syncModels(lock, { outDir: out, fetch: fakeFetch(CONTENT) });
    expect(result.lock).toEqual(lock);
  });

  it("with relock, records the served sizes and hashes and lists what changed", async () => {
    const served = { ...CONTENT, "b.onnx": "new-bravo" };
    const fetch = fakeFetch(served);
    await mkdir(join(out, "en"), { recursive: true });
    await writeFile(join(out, "en", "a.txt"), "alpha\n");
    const result = await syncModels(lockFor(CONTENT), { outDir: out, fetch, relock: true });

    expect(fetch.calls).toHaveLength(2); // relock re-downloads everything
    expect(result.changed).toEqual(["en/b.onnx"]);
    expect(result.lock).toEqual(lockFor(served));
    expect(await read("b.onnx")).toBe("new-bravo");
  });

  it("reports progress through the log callback", async () => {
    const lines: string[] = [];
    await syncModels(lockFor(CONTENT), {
      outDir: out,
      fetch: fakeFetch(CONTENT),
      log: (line) => lines.push(line),
    });
    expect(lines.some((l) => l.includes("en/a.txt"))).toBe(true);
  });
});
