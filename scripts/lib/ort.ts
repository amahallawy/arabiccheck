import { access, copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * The runtime files the checkers load. Both tinyfix and tinyfix-ar import
 * `onnxruntime-web/wasm` with one thread, which needs only the SIMD build:
 * the `.wasm` and, when the runtime is not bundled, its `.mjs` loader.
 * See AgDR-0005.
 */
export const ORT_FILES = ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"] as const;

/** The `dist` folder of the `onnxruntime-web` installed for the package at `packageJsonPath`. */
export function ortDistDir(packageJsonPath: string): string {
  return dirname(createRequire(packageJsonPath).resolve("onnxruntime-web"));
}

/** Copies the runtime files from `distDir` to `destDir`. Checks they all exist before copying any. */
export async function copyOrt(distDir: string, destDir: string): Promise<string[]> {
  for (const name of ORT_FILES) {
    try {
      await access(join(distDir, name));
    } catch {
      throw new Error(`onnxruntime-web is missing ${name} in ${distDir}`);
    }
  }
  await mkdir(destDir, { recursive: true });
  for (const name of ORT_FILES) await copyFile(join(distDir, name), join(destDir, name));
  return [...ORT_FILES];
}
