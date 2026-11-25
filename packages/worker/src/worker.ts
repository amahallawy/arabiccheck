// The module worker's entry point. Start it from a page with
//   new Worker(new URL("./checker-worker.ts", import.meta.url), { type: "module" })
// where checker-worker.ts is `import "@arabiccheck/worker/worker";`.
import type { MessageTarget } from "./protocol.js";
import { serve } from "./serve.js";

const scope = globalThis as unknown as MessageTarget & { readonly location?: { readonly href: string } };
serve(scope, scope.location?.href);
