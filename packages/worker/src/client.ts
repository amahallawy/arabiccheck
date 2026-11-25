import {
  isFromWorker,
  type CheckMessage,
  type InitMessage,
  type MessageTarget,
  type ResultMessage,
  type StatusMessage,
} from "./protocol.js";

/** A check's answer: the suggestions, timings and any per-language errors. */
export type CheckResult = Omit<ResultMessage, "type" | "version">;

export interface CheckerClient {
  /**
   * Asks the worker to check `text`. Resolves with the result, or with `undefined` if a
   * newer check was asked for first: the page only ever acts on the latest text.
   */
  check(text: string, ignored?: Iterable<string>): Promise<CheckResult | undefined>;
  /** Calls `listener` with each language's load status, including any already received. Returns an unsubscribe. */
  onStatus(listener: (status: StatusMessage) => void): () => void;
}

/** The page side of the worker protocol. Sends `init` straight away. */
export function createCheckerClient(target: MessageTarget, init: Omit<InitMessage, "type">): CheckerClient {
  let version = 0;
  const pending = new Map<number, (result: CheckResult | undefined) => void>();
  const statuses: StatusMessage[] = [];
  const listeners = new Set<(status: StatusMessage) => void>();

  target.addEventListener("message", (event) => {
    const message = event.data;
    if (!isFromWorker(message)) return;
    if (message.type === "result") {
      const resolve = pending.get(message.version);
      if (resolve === undefined) return; // superseded, or never asked for
      pending.delete(message.version);
      const { type: _type, version: _version, ...result } = message;
      resolve(result);
      return;
    }
    statuses.push(message);
    for (const listener of listeners) listener(message);
  });

  const initMessage: InitMessage = { type: "init", ...init };
  target.postMessage(initMessage);

  return {
    check(text, ignored = []) {
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
