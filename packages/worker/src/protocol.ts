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
  /**
   * "message" carries protocol data. A Worker also fires "error" when its script fails or
   * crashes, and "messageerror" when a message can't be deserialised; a MessagePort fires
   * only "message" and "messageerror".
   */
  addEventListener(
    type: "message" | "error" | "messageerror",
    listener: (event: { readonly data?: unknown; readonly message?: unknown }) => void,
  ): void;
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isLang = (value: unknown): value is Lang => value === "ar" || value === "en";
const isOptionalString = (value: unknown): boolean => value === undefined || typeof value === "string";
const isStringArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** True for a well-formed `init` or `check` message; anything else is ignored by the worker. */
export function isToWorker(value: unknown): value is ToWorker {
  if (!isObject(value)) return false;
  if (value["type"] === "init") {
    const models = value["models"];
    return (
      isObject(models) &&
      typeof models["ar"] === "string" &&
      typeof models["en"] === "string" &&
      isOptionalString(value["wasmPaths"])
    );
  }
  if (value["type"] === "check") {
    return (
      Number.isFinite(value["version"]) &&
      typeof value["text"] === "string" &&
      (value["ignored"] === undefined || isStringArray(value["ignored"]))
    );
  }
  return false;
}

/** True for a well-formed message from the worker; anything else is ignored by the client. */
export function isFromWorker(value: unknown): value is FromWorker {
  if (!isObject(value)) return false;
  switch (value["type"]) {
    case "ready":
      return isLang(value["lang"]) && typeof value["loadMs"] === "number";
    case "load-error":
      return isLang(value["lang"]) && typeof value["message"] === "string" && isOptionalString(value["file"]);
    case "result":
      return (
        Number.isFinite(value["version"]) &&
        Array.isArray(value["suggestions"]) &&
        isObject(value["timings"]) &&
        Array.isArray(value["errors"])
      );
    default:
      return false;
  }
}
