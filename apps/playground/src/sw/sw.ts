// The playground's service worker (AgDR-0008): caches the page, its scripts, the runtime
// and the models on install, then answers the page's own requests from that cache, so the
// page works with the network off. It never fetches or caches anything from another origin.
// plugins/service-worker.ts emits this file as sw.js and fills in MANIFEST.
import { cacheName, handles, staleCaches } from "./logic.ts";

interface Manifest {
  readonly version: string;
  readonly urls: readonly string[];
}

// The build puts `self.__ARABICCHECK_SW_MANIFEST__ = {"version": …, "urls": […]};` before this code.
const MANIFEST = (self as unknown as { readonly __ARABICCHECK_SW_MANIFEST__: Manifest }).__ARABICCHECK_SW_MANIFEST__;
const CACHE = cacheName(MANIFEST.version);

// The few service-worker types used here (the page's tsconfig has the DOM library, not WebWorker).
interface LifecycleEvent extends Event {
  waitUntil(work: Promise<unknown>): void;
}
interface RequestEvent extends LifecycleEvent {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}
interface Scope {
  readonly location: Location;
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: "install" | "activate", listener: (event: LifecycleEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: RequestEvent) => void): void;
}
const scope = self as unknown as Scope;

scope.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll([...MANIFEST.urls]);
      await scope.skipWaiting();
    })(),
  );
});

scope.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(staleCaches(await caches.keys(), CACHE).map((name) => caches.delete(name)));
      await scope.clients.claim();
    })(),
  );
});

scope.addEventListener("fetch", (event) => {
  if (!handles(event.request, scope.location.origin)) return; // the network answers, untouched
  event.respondWith(respond(event.request));
});

/**
 * The cached copy, else the network. Only install writes to the cache, so it holds exactly
 * the build's files. Offline, a page load that misses gets the cached page.
 */
async function respond(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  // ignoreVary: servers send `Vary: Origin`, and the page's module scripts are requested with an
  // Origin header the install-time requests lacked. These are our own versioned files either way.
  const cached = await cache.match(request, { ignoreVary: true, ignoreSearch: request.mode === "navigate" });
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch (error) {
    if (request.mode === "navigate") {
      const page = await cache.match("./", { ignoreVary: true });
      if (page) return page;
    }
    throw error;
  }
}
