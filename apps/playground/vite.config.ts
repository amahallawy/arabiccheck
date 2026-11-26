import { defineConfig } from "vite";

// AgDR-0007. `vite dev` reads the workspace packages' TypeScript source (AgDR-0006);
// `vite build` uses their built dist/, which the root build makes first.
// `onnxruntime-web-use-extern-wasm` picks the runtime build that loads its .mjs and .wasm
// from `wasmPaths` (/ort/, copied by scripts/copy-ort.ts), so no second 15 MB copy of the
// .wasm lands in assets/. Setting conditions replaces Vite's defaults, so they follow ours.
const DEFAULTS = ["module", "browser", "development|production"];
const RUNTIME = "onnxruntime-web-use-extern-wasm";

export default defineConfig(({ command }) => ({
  // Relative URLs, so the built page also works from a sub-path; the page finds
  // models/ and ort/ from document.baseURI.
  base: "./",
  resolve: { conditions: command === "serve" ? ["@arabiccheck/source", RUNTIME, ...DEFAULTS] : [RUNTIME, ...DEFAULTS] },
  // The checkers run in one module worker (src/checker.worker.ts).
  worker: { format: "es" },
  // Pre-bundling would move onnxruntime-web away from the files its import.meta.url points at.
  optimizeDeps: { exclude: ["onnxruntime-web", "tinyfix", "tinyfix-ar"] },
  build: { target: "es2022" },
}));
