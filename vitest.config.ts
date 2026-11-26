import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolve workspace packages to their TypeScript source (AgDR-0006). Setting
  // conditions replaces Vite's defaults, so they are listed again after ours.
  resolve: { conditions: ["@arabiccheck/source", "module", "browser", "development|production"] },
  ssr: { resolve: { conditions: ["@arabiccheck/source", "module", "node", "development|production"] } },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts", "scripts/test/**/*.test.ts", "eval/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts", "scripts/lib/**/*.ts", "eval/src/**/*.ts"],
      // The worker entries are a line or two binding serve() to the worker global; serve() is tested.
      // eval/src/run.ts is the command-line runner, exercised by `npm run eval` itself.
      // The playground's main.ts is its DOM layer, checked in the browser (AgDR-0007).
      exclude: [
        "packages/worker/src/worker.ts",
        "apps/playground/src/checker.worker.ts",
        "apps/playground/src/main.ts",
        // The service worker's entry wires logic.ts (tested) to its events; the e2e tests run it.
        "apps/playground/src/sw/sw.ts",
        "eval/src/run.ts",
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
