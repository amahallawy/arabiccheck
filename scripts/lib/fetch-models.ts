import { readFile, writeFile } from "node:fs/promises";
import { parseLock } from "./lock.ts";
import { syncModels, type SyncOptions, type SyncResult } from "./sync.ts";

export interface FetchModelsOptions extends SyncOptions {
  /** Path of `models.lock.json`. */
  readonly lockPath: string;
}

/**
 * Reads and validates the lock, syncs the files, and, only with `relock`,
 * writes the lock back. The new lock is validated again before it is written,
 * so the tool never writes a lock its next run would reject. Without `relock`
 * the lock file is never opened for writing.
 */
export async function fetchModels(options: FetchModelsOptions): Promise<SyncResult> {
  const raw = await readFile(options.lockPath, "utf8");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `models.lock.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const result = await syncModels(parseLock(json), options);
  if (options.relock) {
    const checked = parseLock(result.lock);
    await writeFile(options.lockPath, `${JSON.stringify(checked, null, 2)}\n`);
  }
  return result;
}
