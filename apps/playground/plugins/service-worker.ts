// Vite plugin (AgDR-0008): emits src/sw/sw.ts as sw.js at the site root, with the list of
// files to cache and the cache version filled in. Runs in `vite build` only.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Plugin } from "vite";
import { cacheVersion, precacheUrls } from "../src/sw/logic.ts";

const GLOBAL = "__ARABICCHECK_SW_MANIFEST__";

export interface ServiceWorkerOptions {
  /** The service worker's source. */
  readonly entry: string;
  /** models.lock.json: the models the cache holds. */
  readonly lockFile: string;
  /** Vite's public folder (ort/ and models/ are copied from here). */
  readonly publicDir: string;
  /** onnxruntime-web's version, part of the cache version. */
  readonly runtimeVersion: string;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)));
}

export function serviceWorker(options: ServiceWorkerOptions): Plugin {
  return {
    name: "arabiccheck-service-worker",
    apply: "build",
    buildStart() {
      this.emitFile({ type: "chunk", id: options.entry, fileName: "sw.js" });
    },
    async generateBundle(_output, bundle) {
      const urls = precacheUrls([...Object.keys(bundle), ...filesUnder(options.publicDir)]);
      if (!urls.some((url) => url.startsWith("models/"))) {
        this.error(`no model files under ${options.publicDir}: run npm run fetch-models before building`);
      }
      const version = await cacheVersion(readFileSync(options.lockFile, "utf8"), urls, options.runtimeVersion);
      const sw = bundle["sw.js"];
      if (sw?.type !== "chunk" || !sw.code.includes(GLOBAL)) this.error(`sw.js was built without reading ${GLOBAL}`);
      if (sw.imports.length > 0) this.error(`sw.js must be one script, but imports ${sw.imports.join(", ")}`);
      sw.code = `self.${GLOBAL} = ${JSON.stringify({ version, urls })};\n${sw.code}`;
      this.info(`service worker: ${urls.length} files, cache ${version}`);
    },
  };
}
