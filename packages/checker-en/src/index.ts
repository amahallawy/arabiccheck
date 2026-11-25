import type { Checker, Suggestion } from "@arabiccheck/core";
import { loadTinyfix, type Fix, type LoadOptions, type Tinyfix } from "tinyfix";

/** The checker and version behind every English suggestion. Must match the installed tinyfix. */
export const CHECKER_ID = "tinyfix@0.1.1";

export interface EnglishCheckerOptions {
  /** Folder holding words.txt, wrong-word.onnx, wrong-word-vocab.txt and wrong-word-confusions.txt. */
  readonly baseUrl: string | URL;
  /** Folder holding onnxruntime-web's .wasm files. */
  readonly wasmPaths?: string;
  /**
   * "careful" (the default, the owner's call in AgDR-0006) makes fewer wrong changes to correct words;
   * "balanced" fixes more and is what tinyfix's published numbers describe.
   */
  readonly mode?: "careful" | "balanced";
}

export interface EnglishChecker extends Checker {
  /** Frees the model. The checker can't be used afterwards. */
  dispose(): Promise<void>;
}

/** Turns tinyfix's fixes into suggestions. Its spans are already UTF-16 string indices. */
export function toSuggestions(fixes: readonly Fix[]): Suggestion[] {
  return fixes.map((fix): Suggestion => ({
    start: fix.from,
    end: fix.to,
    typed: fix.original,
    replacement: fix.replacement,
    lang: "en",
    kind: fix.kind === "context" ? "real-word" : "spelling",
    score: fix.confidence,
    scoreKind: "confidence",
    checker: CHECKER_ID,
  }));
}

/**
 * Loads the English checker. Inside a worker (no `document`) tinyfix runs its model inline
 * rather than starting a worker of its own. `load` is replaceable for tests.
 */
export async function loadEnglishChecker(
  options: EnglishCheckerOptions,
  load: (options: LoadOptions) => Promise<Tinyfix> = loadTinyfix,
): Promise<EnglishChecker> {
  const tinyfix = await load({
    baseUrl: options.baseUrl,
    mode: options.mode ?? "careful",
    ...(options.wasmPaths === undefined ? {} : { wasmPaths: options.wasmPaths }),
  });
  return {
    id: CHECKER_ID,
    lang: "en",
    check: async (text) => toSuggestions(await tinyfix.check(text)),
    dispose: () => tinyfix.dispose(),
  };
}
