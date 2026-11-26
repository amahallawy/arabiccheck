// The playground's logic, as pure functions the DOM layer (main.ts) renders. AgDR-0007.
import { merge, type Lang, type Suggestion } from "@arabiccheck/core";
import type { CheckResult, StatusMessage } from "@arabiccheck/worker";

/** A stretch of one paragraph; `mark` is the index of the suggestion it shows. */
export interface Piece {
  readonly text: string;
  readonly mark?: number;
}

/** One line of the text, as the marked view shows it. */
export interface Paragraph {
  /** Offset of the line's first character in the whole text. */
  readonly start: number;
  readonly pieces: readonly Piece[];
}

const LANGS: readonly Lang[] = ["ar", "en"];
const NAMES: Readonly<Record<Lang, string>> = { ar: "Arabic", en: "English" };

/**
 * Splits the text into lines (`\n`, `\r\n` or `\r`), each with the suggestions inside
 * it marked in place. A suggestion that crosses a line break is not marked.
 */
export function paragraphs(text: string, suggestions: readonly Suggestion[]): Paragraph[] {
  const result: Paragraph[] = [];
  const breaks = /\r\n|\n|\r/g;
  let start = 0;
  for (;;) {
    const found = breaks.exec(text);
    const end = found ? found.index : text.length;
    result.push({ start, pieces: piecesOf(text, start, end, suggestions) });
    if (!found) return result;
    start = found.index + found[0].length;
  }
}

function piecesOf(text: string, start: number, end: number, suggestions: readonly Suggestion[]): Piece[] {
  const pieces: Piece[] = [];
  let at = start;
  suggestions.forEach((s, index) => {
    if (s.start < at || s.end > end || s.start >= s.end) return;
    if (s.start > at) pieces.push({ text: text.slice(at, s.start) });
    pieces.push({ text: text.slice(s.start, s.end), mark: index });
    at = s.end;
  });
  if (end > at) pieces.push({ text: text.slice(at, end) });
  return pieces;
}

/** The suggestions to show for the text as it is now: not ignored, and still holding their word. */
export function visible(text: string, suggestions: readonly Suggestion[], ignored: ReadonlySet<string>): Suggestion[] {
  return merge(text, suggestions, ignored);
}

const delta = (s: Suggestion): number => s.replacement.length - (s.end - s.start);

/**
 * Where an offset in the text before `applied` were accepted ends up afterwards: moved by
 * each earlier replacement's change in length, or to the end of a replacement it was inside.
 * Used to keep the caret where the writer left it.
 */
export function moveOffset(offset: number, applied: readonly Suggestion[]): number {
  let moved = offset;
  for (const s of applied) {
    if (s.end <= offset) moved += delta(s);
    else if (s.start < offset) moved += s.start + s.replacement.length - offset;
  }
  return moved;
}

/** The other suggestions after `applied` were accepted: moved to their new offsets, minus any that overlapped. */
export function shiftAfter(suggestions: readonly Suggestion[], applied: readonly Suggestion[]): Suggestion[] {
  return suggestions
    .filter((s) => !applied.some((a) => a.start < s.end && s.start < a.end))
    .map((s) => {
      const by = applied.filter((a) => a.end <= s.start).reduce((sum, a) => sum + delta(a), 0);
      return by === 0 ? s : { ...s, start: s.start + by, end: s.end + by };
    });
}

/** tinyfix-ar's edit kinds, as a reader would name them. "typed" and "other" say nothing, so they are left out. */
const DETAILS: Readonly<Record<string, string | null>> = {
  typed: null,
  other: null,
  hamza: "hamza",
  taa_marbuta: "taa marbuta",
  alif_maqsura: "alef maqsura",
  alif_fariqa: "alef after waw",
  spelling_mixed: "mixed spelling",
  sound_alike: "sound-alike letter",
  clitic: "attached word",
  typo: "typo",
};

/** "spelling", "real-word", or "real-word · hamza" when the Arabic checker names the edit. */
export function kindLabel(s: Suggestion): string {
  if (s.detail === undefined) return s.kind;
  const detail = s.detail in DETAILS ? DETAILS[s.detail] : s.detail.replaceAll("_", " ");
  return detail ? `${s.kind} · ${detail}` : s.kind;
}

const ms = (value: number): string => `${Math.round(value)} ms`;

/** One line for the footer: each model's load time, or what failed. */
export function statusLine(statuses: readonly StatusMessage[]): string {
  return LANGS.map((lang) => {
    const status = statuses.findLast((s) => s.lang === lang);
    const name = `${NAMES[lang]} model`;
    if (status === undefined) return `${name}: loading…`;
    if (status.type === "ready") return `${name}: loaded in ${ms(status.loadMs)}`;
    const file = status.file === undefined ? "" : ` ${status.file}`;
    return `${name}: failed to load${file} (${status.message})`;
  }).join(" · ");
}

/** One line for the footer: how long the last check took, and any language whose check failed. */
export function checkLine(result: CheckResult | undefined): string {
  if (result === undefined) return "Last check: none yet";
  const parts = LANGS.flatMap((lang) => {
    const time = result.timings.byLang[lang];
    return time === undefined ? [] : [`${NAMES[lang]} ${ms(time)}`];
  });
  const line = `Last check: ${ms(result.timings.totalMs)}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`;
  const failures = result.errors.map((e) => `${NAMES[e.lang]} check failed: ${e.message}`);
  return [line, ...failures].join(" · ");
}

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Runs at once with these arguments, dropping any call still waiting. */
  now(...args: A): void;
}

/** Calls `fn` once the calls have stopped for `delayMs`, with the latest arguments. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, delayMs: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const debounced = (...args: A): void => {
    cancel();
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delayMs);
  };
  debounced.now = (...args: A): void => {
    cancel();
    fn(...args);
  };
  return debounced;
}
