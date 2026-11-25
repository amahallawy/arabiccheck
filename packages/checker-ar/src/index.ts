import type { Checker, Suggestion } from "@arabiccheck/core";
import {
  loadTinyfixAr,
  type Change,
  type LoadOptions,
  type TinyfixAr,
  type WordJudgement,
} from "tinyfix-ar";

/** The checker and version behind every Arabic suggestion. Must match the installed tinyfix-ar. */
export const CHECKER_ID = "tinyfix-ar@1.0.0";

export interface ArabicCheckerOptions {
  /** Folder holding the exported bundle: model.onnx, vocab.txt, the lexicon tables, kinds.json, manifest.json. */
  readonly baseUrl: string | URL;
  /** Folder holding onnxruntime-web's .wasm files. */
  readonly wasmPaths?: string;
}

export interface ArabicChecker extends Checker {
  /** Frees the model. The checker can't be used afterwards. */
  dispose(): Promise<void>;
}

/**
 * Turns tinyfix-ar's changes into suggestions. `fix()` decides what changes, since its
 * thresholds are calibrated for that; `judge()`'s entry for the same span adds:
 * - `kind`: "spelling" when the typed word is a known misspelling, else "real-word";
 * - `detail`: the edit kind ("hamza", "taa_marbuta", …), only when the judged best word
 *   is the replacement itself, so the label always describes the change shown.
 */
export function toSuggestions(changes: readonly Change[], judgements: readonly WordJudgement[]): Suggestion[] {
  const bySpan = new Map(judgements.map((j) => [`${j.start}:${j.end}`, j]));
  return changes.map((change): Suggestion => {
    const judged = bySpan.get(`${change.start}:${change.end}`);
    return {
      start: change.start,
      end: change.end,
      typed: change.typed,
      replacement: change.replacement,
      lang: "ar",
      kind: judged?.misspelled ? "spelling" : "real-word",
      ...(judged && judged.best === change.replacement ? { detail: judged.kind } : {}),
      score: change.margin,
      scoreKind: "margin",
      checker: CHECKER_ID,
    };
  });
}

/**
 * Loads the Arabic checker. `fix()` and `judge()` run one after the other, never at once,
 * on the one ONNX session. `load` is replaceable for tests.
 */
export async function loadArabicChecker(
  options: ArabicCheckerOptions,
  load: (options: LoadOptions) => Promise<TinyfixAr> = loadTinyfixAr,
): Promise<ArabicChecker> {
  const model = await load({
    baseUrl: options.baseUrl,
    ...(options.wasmPaths === undefined ? {} : { wasmPaths: options.wasmPaths }),
  });
  return {
    id: CHECKER_ID,
    lang: "ar",
    check: async (text) => {
      const { changes } = await model.fix(text);
      if (changes.length === 0) return [];
      return toSuggestions(changes, await model.judge(text));
    },
    dispose: () => model.dispose(),
  };
}
