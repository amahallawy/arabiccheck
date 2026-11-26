import type { Suggestion } from "./types.js";

const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/** True if `i` falls between the two halves of a surrogate pair. */
function splitsPair(text: string, i: number): boolean {
  return i > 0 && i < text.length && isLowSurrogate(text.charCodeAt(i));
}

/**
 * True if the suggestion's span is a non-empty range inside the text, on
 * character boundaries, and still holds what was typed. Empty spans are
 * rejected: M0's checkers only replace words, and an empty `typed` would
 * match anywhere, even after the user has edited the text.
 */
function holdsTyped(text: string, s: Suggestion): boolean {
  return (
    Number.isInteger(s.start) &&
    Number.isInteger(s.end) &&
    s.start >= 0 &&
    s.start < s.end &&
    s.end <= text.length &&
    !splitsPair(text, s.start) &&
    !splitsPair(text, s.end) &&
    text.slice(s.start, s.end) === s.typed
  );
}

function overlaps(a: Suggestion, b: Suggestion): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Combines suggestions from all checkers into the list to show, sorted by start:
 *
 * - drops any whose span no longer holds the typed text, any that would change
 *   nothing, any with a score that is not a finite number, and any whose typed
 *   text is in `ignored` (an exact, case-sensitive match);
 * - where two suggestions with the same `scoreKind` overlap, keeps the higher
 *   score (the earlier start on a tie, then the input order);
 * - where suggestions with different score kinds overlap, drops both: their
 *   scores are not comparable, and two checkers disagreeing about the same
 *   characters is not a change worth showing (precision over recall).
 *
 * The input array is not modified.
 */
export function merge(
  text: string,
  suggestions: readonly Suggestion[],
  ignored: ReadonlySet<string> = new Set(),
): Suggestion[] {
  const valid = suggestions.filter(
    (s) =>
      holdsTyped(text, s) &&
      s.replacement !== s.typed &&
      Number.isFinite(s.score) &&
      !ignored.has(s.typed),
  );

  // Within one score kind: strongest first, keep what does not overlap.
  const byKind = new Map<Suggestion["scoreKind"], Suggestion[]>();
  for (const s of valid) {
    const group = byKind.get(s.scoreKind);
    if (group) group.push(s);
    else byKind.set(s.scoreKind, [s]);
  }
  const winners: Suggestion[] = [];
  for (const group of byKind.values()) {
    const kept: Suggestion[] = [];
    for (const s of group.sort((a, b) => b.score - a.score || a.start - b.start)) {
      if (!kept.some((k) => overlaps(k, s))) kept.push(s);
    }
    winners.push(...kept);
  }

  // Across score kinds: an overlap is a conflict, so neither survives.
  return winners
    .filter((s) => !winners.some((o) => o.scoreKind !== s.scoreKind && overlaps(o, s)))
    .sort((a, b) => a.start - b.start);
}

/**
 * Applies one suggestion. Only its span changes. If the span no longer holds
 * the typed text (the user kept typing), the text is returned unchanged.
 */
export function apply(text: string, suggestion: Suggestion): string {
  if (!holdsTyped(text, suggestion)) return text;
  return text.slice(0, suggestion.start) + suggestion.replacement + text.slice(suggestion.end);
}

/**
 * Applies every suggestion that still holds its typed text, by the same rules as
 * `apply()`. Where two overlap, the earlier one in the list wins and the other is
 * skipped. Replacements are made from the end of the text backwards, so each
 * suggestion's offsets still refer to the text as it was checked.
 */
export function applyAll(text: string, suggestions: readonly Suggestion[]): string {
  const chosen: Suggestion[] = [];
  for (const s of suggestions) {
    if (holdsTyped(text, s) && !chosen.some((c) => overlaps(c, s))) chosen.push(s);
  }
  let result = text;
  for (const s of chosen.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, s.start) + s.replacement + result.slice(s.end);
  }
  return result;
}
