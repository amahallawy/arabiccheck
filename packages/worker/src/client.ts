import type { Lang } from "@arabiccheck/core";
import {
  isFromWorker,
  type CheckMessage,
  type InitMessage,
  type LoadErrorMessage,
  type MessageTarget,
  type ResultMessage,
  type StatusMessage,
} from "./protocol.js";

/** A check's answer: the suggestions, timings and any per-language errors. */
export type CheckResult = Omit<ResultMessage, "type" | "version">;

export interface CheckerClient {
  /**
   * Asks the worker to check `text`. Resolves with the result, or with `undefined` if a
   * newer check was asked for first: the page only ever acts on the latest text. If the
   * worker has died, resolves at once with an error for each language.
   */
  check(text: string, ignored?: Iterable<string>): Promise<CheckResult | undefined>;
  /** Calls `listener` with each language's load status, including any already received. Returns an unsubscribe. */
  onStatus(listener: (status: StatusMessage) => void): () => void;
}

const LANGS: readonly Lang[] = ["ar", "en"];

const failedResult = (message: string): CheckResult => ({
  suggestions: [],
  timings: { totalMs: 0, byLang: {} },
  errors: LANGS.map((lang) => ({ lang, message })),
});

/**
 * The page side of the worker protocol. Sends `init` straight away.
 *
 * Use one client per worker: versions start at 1 for each client, and the worker answers
 * only the newest version it has seen.
 */
export function createCheckerClient(target: MessageTarget, init: Omit<InitMessage, "type">): CheckerClient {
  let version = 0;
  let failure: string | undefined;
  let answered = false; // has the worker ever sent a protocol message?
  const pending = new Map<number, (result: CheckResult | undefined) => void>();
  const statuses: StatusMessage[] = [];
  const listeners = new Set<(status: StatusMessage) => void>();

  const report = (status: StatusMessage): void => {
    statuses.push(status);
    for (const listener of listeners) listener(status);
  };

  const answerPending = (result: CheckResult): void => {
    for (const [waiting, resolve] of pending) {
      resolve(result);
      pending.delete(waiting);
    }
  };

  target.addEventListener("message", (event) => {
    const message = event.data;
    if (!isFromWorker(message)) return;
    answered = true;
    if (message.type === "result") {
      const resolve = pending.get(message.version);
      if (resolve === undefined) return; // superseded, or never asked for
      pending.delete(message.version);
      resolve({ suggestions: message.suggestions, timings: message.timings, errors: message.errors });
      return;
    }
    report(message);
  });

  target.addEventListener("error", (event) => {
    if (failure !== undefined) return;
    const reason = String(event.message || "unknown error");
    if (answered) {
      // An uncaught exception inside a running worker: the worker carries on, but the
      // checks waiting now may never be answered.
      answerPending(failedResult(`the checker worker hit an error: ${reason}`));
      return;
    }
    // The worker never answered, so its script failed to load: nothing will answer.
    failure = `the checker worker could not start: ${reason}`;
    for (const lang of LANGS) {
      const status: LoadErrorMessage = { type: "load-error", lang, message: failure };
      report(status);
    }
    answerPending(failedResult(failure));
  });

  // A reply could not be read; the check waiting for it would otherwise never resolve.
  target.addEventListener("messageerror", () => {
    answerPending(failedResult("a reply from the checker worker could not be read"));
  });

  const initMessage: InitMessage = { type: "init", ...init };
  target.postMessage(initMessage);

  return {
    check(text, ignored = []) {
      if (failure !== undefined) return Promise.resolve(failedResult(failure));
      version += 1;
      for (const [older, resolve] of pending) {
        resolve(undefined);
        pending.delete(older);
      }
      const message: CheckMessage = { type: "check", version, text, ignored: [...ignored] };
      return new Promise((resolve) => {
        pending.set(message.version, resolve);
        target.postMessage(message);
      });
    },
    onStatus(listener) {
      for (const status of statuses) listener(status);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
