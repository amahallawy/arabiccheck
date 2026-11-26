import { metrics, type Counts, type Metrics, type TokenEvent } from "./score.ts";
import type { SetInfo } from "./sets.ts";

/** One set scored with one checker configuration. */
export interface SetRun {
  readonly set: SetInfo;
  /** The English checker's mode for this run: "careful" (what ships) or "balanced". */
  readonly config: string;
  /** Read from a local path given on the command line, never committed. */
  readonly external: boolean;
  readonly cases: number;
  readonly counts: Counts;
  readonly events: readonly TokenEvent[];
  readonly ms: number;
}

export interface Verdict {
  /** SC-001: clean sets, at most 1 false alarm per 1,000 words. SC-002: error sets, precision at least 90%. */
  readonly target: "SC-001" | "SC-002";
  readonly pass: boolean;
  /** False for an Arabic seed set the owner hasn't reviewed yet: its numbers don't count. */
  readonly counted: boolean;
}

export function verdict(run: SetRun): Verdict {
  const m = metrics(run.counts);
  const counted = run.external || run.set.lang !== "ar" || run.set.reviewed !== undefined;
  return run.set.kind === "clean"
    ? { target: "SC-001", pass: m.falseAlarmsPer1000 !== null && m.falseAlarmsPer1000 <= 1, counted }
    : { target: "SC-002", pass: m.precision !== null && m.precision >= 0.9, counted };
}

const percent = (value: number | null): string => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);
const perThousand = (value: number | null): string => (value === null ? "n/a" : value.toFixed(2));

const COLUMNS = ["Set", "Config", "Cases", "Tokens", "Errors", "Changes", "Fixed", "Precision", "Recall", "FA/1000", "Target"];

/** The table printed by `npm run eval`, then each set's false alarms, wrong fixes and misses. */
export function formatReport(runs: readonly SetRun[]): string {
  const rows = runs.map((run) => {
    const m: Metrics = metrics(run.counts);
    const v = verdict(run);
    const target = `${v.target} ${v.pass ? "pass" : "FAIL"}${v.counted ? "" : " (not counted: not yet reviewed by the owner)"}`;
    return [
      run.set.name,
      run.config,
      String(run.cases),
      String(run.counts.tokens),
      String(run.counts.errors),
      String(run.counts.changes),
      String(run.counts.correctFixes),
      percent(m.precision),
      percent(m.recall),
      perThousand(m.falseAlarmsPer1000),
      target,
    ];
  });
  const widths = COLUMNS.map((column, i) => Math.max(column.length, ...rows.map((row) => row[i]?.length ?? 0)));
  const line = (cells: readonly string[]): string => cells.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join(" | ");
  const table = [line(COLUMNS), widths.map((w) => "-".repeat(w)).join("-|-"), ...rows.map(line)].join("\n");

  // Correct fixes stay in report.json; the printout lists only what needs a look.
  const details = runs
    .map((run) => ({ run, events: run.events.filter((e) => e.outcome !== "fixed") }))
    .filter(({ events }) => events.length > 0)
    .map(({ run, events }) => {
      const lines = events.map(
        (e) => `  ${e.outcome.padEnd(11)}  ${e.id} #${e.index}: "${e.typed}" -> "${e.output}" (expected "${e.expected}")`,
      );
      return [`${run.set.name} (${run.config}):`, ...lines].join("\n");
    });
  return [table, ...details].join("\n\n");
}

/** The content of `eval/report.json`. */
export function toJson(runs: readonly SetRun[], generated: string): unknown {
  return {
    generated,
    runs: runs.map((run) => ({
      set: run.set.name,
      lang: run.set.lang,
      kind: run.set.kind,
      config: run.config,
      external: run.external,
      counted: verdict(run).counted,
      cases: run.cases,
      ms: Math.round(run.ms),
      counts: run.counts,
      metrics: metrics(run.counts),
      verdict: verdict(run),
      events: run.events,
    })),
  };
}
