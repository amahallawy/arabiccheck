import type { Lang, Suggestion } from "@arabiccheck/core";

/** Page → worker, once, first: where the models and the runtime are. */
export interface InitMessage {
  readonly type: "init";
  /** Folder URL per language, such as "/models/en/". Relative URLs resolve against the worker's location. */
  readonly models: Readonly<Record<Lang, string>>;
  /** Folder holding onnxruntime-web's .wasm files, such as "/ort/". */
  readonly wasmPaths?: string;
}

/** Page → worker: check this text. `version` increases with every request. */
export interface CheckMessage {
  readonly type: "check";
  readonly version: number;
  readonly text: string;
  /** Typed words the user chose to ignore this session. */
  readonly ignored?: readonly string[];
}

export type ToWorker = InitMessage | CheckMessage;

/** Worker → page: a language's checker loaded. */
export interface ReadyMessage {
  readonly type: "ready";
  readonly lang: Lang;
  readonly loadMs: number;
}

/** Worker → page: a language's checker failed to load; that language is not checked. */
export interface LoadErrorMessage {
  readonly type: "load-error";
  readonly lang: Lang;
  /** The file that failed, when the error names one. */
  readonly file?: string;
  readonly message: string;
}

/** Worker → page: the suggestions for one check request. */
export interface ResultMessage {
  readonly type: "result";
  readonly version: number;
  /** Merged across languages, sorted by start, in the original text's UTF-16 offsets. */
  readonly suggestions: readonly Suggestion[];
  readonly timings: { readonly totalMs: number; readonly byLang: Readonly<Partial<Record<Lang, number>>> };
  /** Languages whose check failed for this text; the other language's suggestions are still included. */
  readonly errors: readonly { readonly lang: Lang; readonly message: string }[];
}

export type FromWorker = ReadyMessage | LoadErrorMessage | ResultMessage;
export type StatusMessage = ReadyMessage | LoadErrorMessage;

/** What both ends need of a Worker, a worker's global scope or a MessagePort. */
export interface MessageTarget {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { readonly data: unknown }) => void): void;
}

const hasType = (value: unknown): value is { type: unknown } =>
  typeof value === "object" && value !== null && "type" in value;

export function isToWorker(value: unknown): value is ToWorker {
  return hasType(value) && (value.type === "init" || value.type === "check");
}

export function isFromWorker(value: unknown): value is FromWorker {
  return hasType(value) && (value.type === "ready" || value.type === "load-error" || value.type === "result");
}
