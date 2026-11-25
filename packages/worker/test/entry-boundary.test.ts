// The page imports `@arabiccheck/worker`; only the worker imports `@arabiccheck/worker/worker`.
// If the page entry ever reached the checkers, the models' loaders and the ONNX runtime
// would end up in the page bundle, on the main thread. This test fails if it does.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

/** Every source file reachable from `entry` through relative imports, and every package it imports. */
function graph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string): void => {
    if (files.has(file)) return;
    files.add(file);
    const code = readFileSync(join(SRC, file), "utf8");
    for (const match of code.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)) {
      const specifier = match[1] ?? match[2]; // static import/export, or dynamic import()
      if (specifier === undefined) continue;
      if (specifier.startsWith("./")) visit(specifier.slice(2).replace(/\.js$/, ".ts"));
      else packages.add(specifier);
    }
  };
  visit(entry);
  return { files, packages };
}

describe("the page entry (index.ts)", () => {
  it("never reaches the worker-only code", () => {
    const { files } = graph("index.ts");
    expect(files.has("serve.ts")).toBe(false);
    expect(files.has("worker.ts")).toBe(false);
  });

  it("imports no package but core", () => {
    expect([...graph("index.ts").packages]).toEqual(["@arabiccheck/core"]);
  });

  it("is what the worker entry builds on, so the check above is meaningful", () => {
    const { files, packages } = graph("worker.ts");
    expect(files.has("serve.ts")).toBe(true);
    expect(packages.has("@arabiccheck/checker-en")).toBe(true);
  });
});
