import { loadArabicChecker } from "@arabiccheck/checker-ar";
import { loadEnglishChecker } from "@arabiccheck/checker-en";
import { createHandler, type CheckerLoaders } from "./handler.js";
import { isToWorker, type InitMessage, type MessageTarget } from "./protocol.js";

/** The real checkers, with the init message's folder URLs resolved against `baseHref`. */
export function defaultLoaders(baseHref: string | undefined): CheckerLoaders {
  const absolute = (url: string): string => new URL(url, baseHref).href;
  const runtime = (init: InitMessage): { wasmPaths?: string } =>
    init.wasmPaths === undefined ? {} : { wasmPaths: absolute(init.wasmPaths) };
  return {
    en: (init) => loadEnglishChecker({ baseUrl: absolute(init.models.en), ...runtime(init) }),
    ar: (init) => loadArabicChecker({ baseUrl: absolute(init.models.ar), ...runtime(init) }),
  };
}

/**
 * Answers the worker protocol on `scope`: a worker's global scope in the browser, or one
 * end of a MessageChannel in tests. Messages that aren't part of the protocol are ignored.
 */
export function serve(
  scope: MessageTarget,
  baseHref: string | undefined,
  loaders: CheckerLoaders = defaultLoaders(baseHref),
): void {
  const handler = createHandler(loaders, (message) => scope.postMessage(message));
  scope.addEventListener("message", (event) => {
    if (!isToWorker(event.data)) return;
    // The handler reports load and check failures itself; anything reaching here is a bug.
    handler.handle(event.data).catch((error: unknown) => console.error("ArabicCheck worker:", error));
  });
}
