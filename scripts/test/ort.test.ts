import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyOrt, ORT_FILES, ortDistDir } from "../lib/ort.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arabiccheck-ort-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("copyOrt", () => {
  it("copies only the single-threaded SIMD runtime files, creating the folder", async () => {
    const dist = join(dir, "dist");
    await mkdir(dist);
    for (const name of [...ORT_FILES, "ort-wasm-simd-threaded.jsep.wasm"]) {
      await writeFile(join(dist, name), name);
    }
    const dest = join(dir, "public", "ort");
    expect(await copyOrt(dist, dest)).toEqual([...ORT_FILES]);
    for (const name of ORT_FILES) expect(await readFile(join(dest, name), "utf8")).toBe(name);
    expect(existsSync(join(dest, "ort-wasm-simd-threaded.jsep.wasm"))).toBe(false);
  });

  it("fails naming the file when the runtime is incomplete", async () => {
    const dist = join(dir, "dist");
    await mkdir(dist);
    await writeFile(join(dist, ORT_FILES[0]), "x");
    await expect(copyOrt(dist, join(dir, "out"))).rejects.toThrow(ORT_FILES[1]);
  });
});

describe("ortDistDir", () => {
  it("finds the installed onnxruntime-web dist folder from the playground package", () => {
    const dist = ortDistDir(resolve("apps/playground/package.json"));
    for (const name of ORT_FILES) expect(existsSync(join(dist, name))).toBe(true);
  });
});
