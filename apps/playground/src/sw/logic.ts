// The service worker's decisions, as pure functions (AgDR-0008). sw.ts wires them up.

export const CACHE_PREFIX = "arabiccheck-";

/** The URLs to cache on install: the page's root, then every built file, relative to the worker. */
export function precacheUrls(files: readonly string[]): string[] {
  const urls = new Set<string>();
  for (const file of files) {
    const path = file.replaceAll("\\", "/").replace(/^\.\//, "");
    const name = path.split("/").at(-1) ?? "";
    if (path === "sw.js" || name.startsWith(".") || path.endsWith(".map")) continue;
    urls.add(path.split("/").map(encodeURIComponent).join("/"));
  }
  return ["./", ...[...urls].sort()];
}

export interface VersionInput {
  /** models.lock.json's text. */
  readonly lock: string;
  /** The cached files' names (Vite hashes the scripts' names, so they change with the code). */
  readonly files: readonly string[];
  /** onnxruntime-web's version. */
  readonly runtime: string;
  /** The service worker's own code, so a change to it makes a new cache too. */
  readonly code: string;
}

/** The cache's version: 16 hex characters of a SHA-256 over everything that decides what it holds. */
export async function cacheVersion({ lock, files, runtime, code }: VersionInput): Promise<string> {
  const input = JSON.stringify({ lock, files: [...files].sort(), runtime, code });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function cacheName(version: string): string {
  return `${CACHE_PREFIX}${version}`;
}

/** This app's caches other than the current one; caches it didn't make are left alone. */
export function staleCaches(names: readonly string[], current: string): string[] {
  return names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== current);
}

/** The worker answers only GET requests to its own origin; anything else goes to the network untouched. */
export function handles(request: { readonly method: string; readonly url: string }, origin: string): boolean {
  if (request.method !== "GET") return false;
  try {
    return new URL(request.url).origin === origin;
  } catch {
    return false; // not a URL: not ours to answer
  }
}
