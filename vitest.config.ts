import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolve workspace packages to their TypeScript source (AgDR-0006). Setting
  // conditions replaces Vite's defaults, so they are listed again after ours.
  resolve: { conditions: ["@arabiccheck/source", "module", "browser", "development|production"] },
  ssr: { resolve: { conditions: ["@arabiccheck/source", "module", "node", "development|production"] } },
  test: {
    include: ["packages/*/test/**/*.test.ts", "scripts/test/**/*.test.ts", "eval/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "scripts/lib/**/*.ts", "eval/src/**/*.ts"],
      // The worker entry is two lines binding serve() to the worker global; serve() is tested.
      // eval/src/run.ts is the command-line runner, exercised by `npm run eval` itself.
      exclude: ["packages/worker/src/worker.ts", "eval/src/run.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
