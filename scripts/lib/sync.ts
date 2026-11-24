import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Lock, LockedFile, ModelSet } from "./lock.ts";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface SyncOptions {
  /** Files go to `<outDir>/<set id>/<name>`. */
  readonly outDir: string;
  /** Defaults to the global `fetch`. */
  readonly fetch?: Fetch;
  /**
   * Re-download every locked URL and return a lock with the sizes and hashes
   * actually served. The only way the lock changes.
   */
  readonly relock?: boolean;
  readonly log?: (line: string) => void;
  /** Per-file download timeout. Defaults to two minutes. */
  readonly timeoutMs?: number;
}

export interface SyncResult {
  /** The input lock, or with `relock` the lock to write back. */
  readonly lock: Lock;
  readonly downloaded: number;
  /** Files already on disk with the locked size and hash. */
  readonly kept: number;
  /** With `relock`: `<set id>/<name>` of each file whose size or hash changed. */
  readonly changed: readonly string[];
}

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

async function readIfPresent(path: string): Promise<Uint8Array | undefined> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function download(fetch: Fetch, url: string, timeoutMs: number): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    // Node's fetch reports only "fetch failed"; the reason (DNS, TLS, timeout) is in `cause`.
    const cause = error instanceof Error ? error.cause : undefined;
    const reason =
      cause instanceof Error ? ` (${(cause as NodeJS.ErrnoException).code ?? cause.message})` : "";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`could not download ${url}: ${message}${reason}`, { cause: error });
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Makes `outDir` hold exactly the locked files. A file already on disk with
 * the locked size and hash is kept. Anything else is downloaded and checked
 * in memory first; on a size or hash mismatch the file on disk is deleted and
 * the sync fails, naming the file. Files are written to `<name>.partial` and
 * renamed, so a failed run never leaves a half-written file under its real name.
 */
export async function syncModels(lock: Lock, options: SyncOptions): Promise<SyncResult> {
  const fetch = options.fetch ?? globalThis.fetch;
  const log = options.log ?? ((): void => {});
  const timeoutMs = options.timeoutMs ?? 120_000;
  const relock = options.relock ?? false;
  let downloaded = 0;
  let kept = 0;
  const changed: string[] = [];
  const sets: ModelSet[] = [];

  for (const set of lock.sets) {
    const dir = join(options.outDir, set.id);
    await mkdir(dir, { recursive: true });
    const files: LockedFile[] = [];

    for (const file of set.files) {
      const label = `${set.id}/${file.name}`;
      const dest = join(dir, file.name);

      if (!relock) {
        const existing = await readIfPresent(dest);
        if (existing && existing.byteLength === file.size && sha256(existing) === file.sha256) {
          log(`ok     ${label}`);
          kept++;
          files.push(file);
          continue;
        }
      }

      log(`fetch  ${label}`);
      const bytes = await download(fetch, file.url, timeoutMs);
      const served: LockedFile = { ...file, size: bytes.byteLength, sha256: sha256(bytes) };

      if (relock) {
        if (served.size !== file.size || served.sha256 !== file.sha256) changed.push(label);
      } else if (served.size !== file.size) {
        await rm(dest, { force: true });
        throw new Error(`${label}: size is ${served.size} bytes, the lock says ${file.size}`);
      } else if (served.sha256 !== file.sha256) {
        await rm(dest, { force: true });
        throw new Error(`${label}: sha256 is ${served.sha256}, the lock says ${file.sha256}`);
      }

      await writeFile(`${dest}.partial`, bytes);
      await rename(`${dest}.partial`, dest);
      downloaded++;
      files.push(served);
    }
    sets.push({ ...set, files });
  }

  return { lock: relock ? { ...lock, sets } : lock, downloaded, kept, changed };
}
