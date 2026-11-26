// Waiting for the service worker before the page starts the checkers (AgDR-0008).

/** What untilActive needs of a ServiceWorker: its state and its "statechange" events. */
export interface WorkerLike extends EventTarget {
  readonly state: string;
}

/** What untilActive needs of a ServiceWorkerRegistration. */
export interface RegistrationLike {
  readonly active: unknown;
  readonly installing: WorkerLike | null;
  readonly waiting: WorkerLike | null;
}

export type Readiness = "active" | "redundant" | "timeout";

const isDone = (state: string): Readiness | undefined =>
  state === "activated" ? "active" : state === "redundant" ? "redundant" : undefined;

/**
 * Resolves once the registration has an active worker, its new worker has failed, or
 * `timeoutMs` has passed, whichever comes first. A state reached before this is called
 * counts, so it never waits for an event that has already happened.
 */
export function untilActive(registration: RegistrationLike, timeoutMs: number): Promise<Readiness> {
  if (registration.active !== null) return Promise.resolve("active");
  const worker = registration.installing ?? registration.waiting;
  if (worker === null) return Promise.resolve("active");
  const already = isDone(worker.state);
  if (already) return Promise.resolve(already);

  return new Promise((resolve) => {
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    const onChange = (): void => {
      const done = isDone(worker.state);
      if (done) finish(done);
    };
    function finish(result: Readiness): void {
      clearTimeout(timer);
      worker?.removeEventListener("statechange", onChange);
      resolve(result);
    }
    worker.addEventListener("statechange", onChange);
  });
}
