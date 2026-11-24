// Downloads the locked model files and checks each against its size and SHA-256.
//
//   npm run fetch-models                  download into apps/playground/public/models/
//   npm run fetch-models -- --out <dir>   download somewhere else
//   npm run fetch-models -- --relock      re-download every locked URL and rewrite
//                                         models.lock.json with what was served
//
// Without --relock the lock is never written, and any mismatch fails the run.
// --relock trusts whatever the locked URLs serve (each capped at 64 MB), so its
// diff of models.lock.json must be reviewed like code.
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { fetchModels } from "./lib/fetch-models.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

try {
  const { values } = parseArgs({
    options: {
      out: { type: "string", default: join(root, "apps", "playground", "public", "models") },
      relock: { type: "boolean", default: false },
    },
  });
  const result = await fetchModels({
    lockPath: join(root, "models.lock.json"),
    outDir: resolve(values.out),
    relock: values.relock,
    log: (line) => console.log(line),
  });
  if (values.relock) {
    console.log(
      result.changed.length === 0
        ? "relock: no size or hash changed"
        : `relock: updated ${result.changed.join(", ")}; review the diff of models.lock.json`,
    );
  }
  console.log(`fetch-models: ${result.downloaded} downloaded, ${result.kept} already present and verified`);
} catch (error) {
  console.error(`fetch-models failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
