import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fetchModels } from "../lib/fetch-models.ts";
import type { Lock } from "../lib/lock.ts";
import type { Fetch } from "../lib/sync.ts";

const REV = "8efdf5cd91b32584f4077aa0e8ecaf48f7651bef";
const SOURCE = "https://huggingface.co/owner/model";
const sha = (body: string): string => createHash("sha256").update(body).digest("hex");

function lockFor(body: string): Lock {
  return {
    schema: 1,
    sets: [
      {
        id: "en",
        package: "pkg@1.0.0",
        source: SOURCE,
        revision: REV,
        license: "MIT",
        files: [
          { name: "a.txt", url: `${SOURCE}/resolve/${REV}/a.txt`, size: body.length, sha256: sha(body) },
        ],
      },
    ],
  };
}

const serving = (body: string): Fetch => async () => new Response(body);

let dir: string;
let lockPath: string;
let outDir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arabiccheck-fetch-"));
  lockPath = join(dir, "models.lock.json");
  outDir = join(dir, "models");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("fetchModels", () => {
  it("never writes the lock without relock, whether the run succeeds or fails", async () => {
    // Deliberately unusual formatting: any rewrite would change these bytes.
    const original = JSON.stringify(lockFor("alpha"));
    await writeFile(lockPath, original);

    await fetchModels({ lockPath, outDir, fetch: serving("alpha") });
    expect(await readFile(lockPath, "utf8")).toBe(original);

    await rm(outDir, { recursive: true });
    await expect(fetchModels({ lockPath, outDir, fetch: serving("ALPHA") })).rejects.toThrow(/sha256/);
    expect(await readFile(lockPath, "utf8")).toBe(original);
  });

  it("with relock, writes the served sizes and hashes as formatted JSON", async () => {
    await writeFile(lockPath, JSON.stringify(lockFor("alpha")));
    const result = await fetchModels({ lockPath, outDir, fetch: serving("beta!!"), relock: true });

    expect(result.changed).toEqual(["en/a.txt"]);
    expect(await readFile(lockPath, "utf8")).toBe(`${JSON.stringify(lockFor("beta!!"), null, 2)}\n`);
    expect(await readFile(join(outDir, "en", "a.txt"), "utf8")).toBe("beta!!");
  });

  it("names the lock file when it is not valid JSON", async () => {
    await writeFile(lockPath, "{ not json");
    await expect(fetchModels({ lockPath, outDir, fetch: serving("alpha") })).rejects.toThrow(
      /models\.lock\.json is not valid JSON/,
    );
  });

  it("rejects an invalid lock before downloading anything", async () => {
    let called = false;
    const fetch: Fetch = async () => {
      called = true;
      return new Response("alpha");
    };
    await writeFile(lockPath, JSON.stringify({ ...lockFor("alpha"), schema: 2 }));
    await expect(fetchModels({ lockPath, outDir, fetch })).rejects.toThrow(/schema/);
    expect(called).toBe(false);
  });
});
