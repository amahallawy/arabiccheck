import { mask, merge, runs, type Checker, type Lang, type Suggestion } from "@arabiccheck/core";
import type { CheckMessage, FromWorker, InitMessage, ResultMessage, ToWorker } from "./protocol.js";

/** How to load each language's checker, given the init message's folders. */
export type CheckerLoaders = Readonly<Record<Lang, (init: InitMessage) => Promise<Checker>>>;

export interface Handler {
  /** Handles one message. Resolves when the work it started has finished. */
  handle(message: ToWorker): Promise<void>;
}

const LANGS: readonly Lang[] = ["ar", "en"];

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Both packages name the failing file: "tinyfix couldn't load words.txt from …". */
const fileOf = (message: string): { file?: string } => {
  const match = /\bload (\S+) from\b/.exec(message);
  return match?.[1] === undefined ? {} : { file: match[1] };
};

/**
 * The worker's logic, separate from the worker global so it can be tested directly.
 *
 * - `init` loads each language independently. A failed load posts `load-error` and
 *   leaves that language unchecked; the other still works.
 * - `check` runs one at a time, in order. A check that a newer one overtook while it
 *   waited is skipped, and a check that finished after a newer one was sent posts
 *   nothing: the page only wants the latest.
 * - Each checker sees only its own language (`mask`), so its offsets are the
 *   original text's; results are merged with `merge`.
 */
export function createHandler(
  loaders: CheckerLoaders,
  post: (message: FromWorker) => void,
  now: () => number = () => performance.now(),
): Handler {
  let checkers: ReadonlyMap<Lang, Promise<Checker | undefined>> | undefined;
  let latest = Number.NEGATIVE_INFINITY;
  let queue: Promise<void> = Promise.resolve();

  function load(lang: Lang, init: InitMessage): Promise<Checker | undefined> {
    const started = now();
    // Through a promise, so a loader that throws synchronously (a malformed URL) is a
    // load-error for that language too, not an escape that skips both.
    return Promise.resolve()
      .then(() => loaders[lang](init))
      .then(
        (checker) => {
          post({ type: "ready", lang, loadMs: now() - started });
          return checker;
        },
        (error: unknown) => {
          const message = messageOf(error);
          post({ type: "load-error", lang, ...fileOf(message), message });
          return undefined;
        },
      );
  }

  async function check(request: CheckMessage): Promise<void> {
    if (request.version < latest) return; // overtaken while queued
    const started = now();
    const errors: { lang: Lang; message: string }[] = [];
    const byLang: Partial<Record<Lang, number>> = {};
    const found: Suggestion[] = [];

    if (checkers === undefined) {
      for (const lang of LANGS) errors.push({ lang, message: "the worker has not been initialised" });
    } else {
      const present = new Set(runs(request.text).map((run) => run.lang));
      for (const lang of LANGS) {
        if (!present.has(lang)) continue;
        const checker = await checkers.get(lang);
        if (checker === undefined) continue; // its load failure was already reported
        const t = now();
        try {
          found.push(...(await checker.check(mask(request.text, lang))));
        } catch (error) {
          errors.push({ lang, message: messageOf(error) });
        }
        byLang[lang] = now() - t;
      }
    }

    if (request.version < latest) return; // a newer request arrived while this one ran
    let suggestions: readonly Suggestion[] = [];
    try {
      suggestions = merge(request.text, found, new Set(request.ignored ?? []));
    } catch (error) {
      // Still answer, so the page's check doesn't wait for a reply that never comes.
      for (const lang of LANGS) errors.push({ lang, message: `merging suggestions failed: ${messageOf(error)}` });
    }
    const result: ResultMessage = {
      type: "result",
      version: request.version,
      suggestions,
      timings: { totalMs: now() - started, byLang },
      errors,
    };
    post(result); // if posting itself fails, nothing can be sent; serve() logs it
  }

  return {
    handle(message) {
      if (message.type === "init") {
        // One init per worker: its folders are fixed for the worker's life.
        if (checkers !== undefined) return Promise.resolve();
        const loading = new Map(LANGS.map((lang) => [lang, load(lang, message)] as const));
        checkers = loading;
        return Promise.all(loading.values()).then(() => undefined);
      }
      latest = Math.max(latest, message.version);
      const run = queue.then(() => check(message));
      // A check that fails unexpectedly rejects its own handle() call (serve logs it), but
      // must not stop the checks queued after it.
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
