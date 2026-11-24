/** A language ArabicCheck checks. */
export type Lang = "ar" | "en";

/** What a character belongs to: a language, or neither (digits, punctuation, spaces, emoji). */
export type Script = Lang | "neutral";

/** A stretch of text in one script. Offsets are UTF-16 code units, end exclusive. */
export interface Run {
  readonly lang: Script;
  readonly start: number;
  readonly end: number;
}

/** One proposed change to the text. */
export interface Suggestion {
  /** Start of the span in the original text, in UTF-16 code units. */
  readonly start: number;
  /** End of the span (exclusive), in UTF-16 code units. */
  readonly end: number;
  /** The text the span held when the suggestion was made. */
  readonly typed: string;
  readonly replacement: string;
  readonly lang: Lang;
  /** `spelling`: the word does not exist. `real-word`: a real word in the wrong place. */
  readonly kind: "spelling" | "real-word";
  /** The checker's own label for the edit, such as the Arabic edit kind ("hamza", "taa_marbuta"). */
  readonly detail?: string;
  /** Higher is surer. Its scale depends on `scoreKind`; scores of different kinds are not comparable. */
  readonly score: number;
  /** `confidence` is 0–1 (tinyfix); `margin` is the model's margin over the typed word (tinyfix-ar). */
  readonly scoreKind: "confidence" | "margin";
  /** Which checker made it, with its version, such as "tinyfix@0.1.1". */
  readonly checker: string;
}

/**
 * Takes text in one language and returns suggestions for it. Spans must be
 * UTF-16 code units in the text it was given (as JavaScript string indices are);
 * an adapter over a checker that counts code points must convert them.
 */
export interface Checker {
  readonly id: string;
  readonly lang: Lang;
  check(text: string): Promise<readonly Suggestion[]>;
}
