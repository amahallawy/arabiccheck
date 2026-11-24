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
  /** Largest file `--relock` accepts. Defaults to `RELOCK_MAX_BYTES`. */
  readonly relockMaxBytes?: number;
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

/** Largest file `--relock` accepts, where there is no locked size to cap a download at. */
export const RELOCK_MAX_BYTES = 64 * 1024 * 1024;

/** Thrown when a response is bigger than allowed; the caller turns it into a message. */
class TooLarge extends Error {}

/**
 * Downloads `url`, following redirects (Hugging Face serves large files from
 * its CDN). Without `--relock` the redirect target needs no trust: the bytes
 * are checked against the locked hash. Reading stops as soon as the body
 * passes `limit` bytes, so a wrong or hostile response can't fill memory.
 */
async function download(fetch: Fetch, url: string, limit: number, timeoutMs: number): Promise<Uint8Array> {
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

  const declared = Number(response.headers.get("content-length") ?? Number.NaN);
  if (declared > limit) {
    await response.body?.cancel();
    throw new TooLarge();
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body?.getReader();
  for (;;) {
    const chunk = reader ? await reader.read() : { done: true as const, value: undefined };
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > limit) {
      await reader?.cancel();
      throw new TooLarge();
    }
    chunks.push(chunk.value);
  }
  if (total === 0) throw new Error(`empty response from ${url}`);
  return new Uint8Array(Buffer.concat(chunks, total));
}

/** Writes via `<dest>.partial` and a rename; removes the partial file if anything fails. */
async function writeAtomically(dest: string, bytes: Uint8Array): Promise<void> {
  const partial = `${dest}.partial`;
  try {
    await writeFile(partial, bytes);
    await rename(partial, dest);
  } finally {
    await rm(partial, { force: true });
  }
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
      const relockMax = options.relockMaxBytes ?? RELOCK_MAX_BYTES;
      const limit = relock ? relockMax : file.size;
      let bytes: Uint8Array;
      try {
        bytes = await download(fetch, file.url, limit, timeoutMs);
      } catch (error) {
        if (!(error instanceof TooLarge)) {
          throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`, {
            cause: error,
          });
        }
        if (!relock) await rm(dest, { force: true });
        throw new Error(
          relock
            ? `${label}: size is over the ${relockMax}-byte limit for --relock`
            : `${label}: size is over ${file.size} bytes, the lock says ${file.size}`,
        );
      }
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

      await writeAtomically(dest, bytes);
      downloaded++;
      files.push(served);
    }
    sets.push({ ...set, files });
  }

  return { lock: relock ? { ...lock, sets } : lock, downloaded, kept, changed };
}
