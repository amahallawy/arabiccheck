// npm run eval                         score the seed sets in eval/sets/ (sets.json)
// npm run eval -- --set <file.jsonl>   also score a local set (QALB, ZAEBUC, …), never committed
// npm run eval -- --json <path>        write the report somewhere other than eval/report.json
//
// Every case goes through the same worker handler the page uses (mask per language,
// both checkers, merge), with the real models served from apps/playground/public/models/.
// English sets run twice: "careful" (what ships) and "balanced", for comparison.
import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadArabicChecker } from "@arabiccheck/checker-ar";
import { loadEnglishChecker } from "@arabiccheck/checker-en";
import type { Suggestion } from "@arabiccheck/core";
import { createHandler, type FromWorker } from "@arabiccheck/worker";
import { startModelServer } from "../../scripts/lib/model-server.ts";
import { formatReport, toJson, type SetRun } from "./report.ts";
import { addCounts, scoreCase, ZERO, type TokenEvent } from "./score.ts";
import { parseCases, parseManifest, type SetInfo, type TestCase } from "./sets.ts";

type Mode = "careful" | "balanced";
type Check = (text: string) => Promise<readonly Suggestion[]>;

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SETS = join(ROOT, "eval", "sets");

/** The product pipeline, in-process: the worker handler with both real checkers. */
async function pipeline(baseUrl: string, mode: Mode): Promise<Check> {
  const posted: FromWorker[] = [];
  const handler = createHandler(
    {
      en: () => loadEnglishChecker({ baseUrl: `${baseUrl}en/`, mode }),
      ar: () => loadArabicChecker({ baseUrl: `${baseUrl}ar/` }),
    },
    (message) => posted.push(message),
  );
  await handler.handle({ type: "init", models: { en: `${baseUrl}en/`, ar: `${baseUrl}ar/` } });
  const failed = posted.find((m) => m.type === "load-error");
  if (failed?.type === "load-error") throw new Error(`the ${failed.lang} checker failed to load: ${failed.message}`);

  let version = 0;
  return async (text) => {
    version += 1;
    await handler.handle({ type: "check", version, text });
    const result = posted.find((m) => m.type === "result" && m.version === version);
    if (result?.type !== "result") throw new Error(`no result for check ${version}`);
    if (result.errors.length > 0) throw new Error(`check failed: ${result.errors.map((e) => `${e.lang}: ${e.message}`).join("; ")}`);
    return result.suggestions;
  };
}

async function score(set: SetInfo, cases: readonly TestCase[], check: Check, config: Mode, external: boolean): Promise<SetRun> {
  const started = performance.now();
  let counts = ZERO;
  const events: TokenEvent[] = [];
  for (const testCase of cases) {
    const result = scoreCase(testCase, await check(testCase.text));
    counts = addCounts(counts, result.counts);
    events.push(...result.events);
  }
  return { set, config, external, cases: cases.length, counts, events, ms: performance.now() - started };
}

/** A set given on the command line: its kind is "clean" if no case expects a change. */
async function externalSet(path: string): Promise<{ set: SetInfo; cases: TestCase[] }> {
  const name = basename(path).replace(/\.jsonl$/, "");
  const content = await readFile(path, "utf8");
  const cases = parseCases(content, name, "errors");
  const first = cases[0];
  if (first === undefined) throw new Error(`${path}: no cases`);
  const kind = cases.every((c) => c.text === c.expected) ? "clean" : "errors";
  return { set: { name, file: path, lang: first.lang, kind, source: `local file ${path}`, licence: "not committed" }, cases };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      set: { type: "string", multiple: true, default: [] },
      json: { type: "string", default: join(ROOT, "eval", "report.json") },
    },
  });

  const manifest = parseManifest(JSON.parse(await readFile(join(SETS, "sets.json"), "utf8")));
  const sets: { set: SetInfo; cases: TestCase[]; external: boolean }[] = [];
  for (const set of manifest) {
    sets.push({ set, cases: parseCases(await readFile(join(SETS, set.file), "utf8"), set.name, set.kind), external: false });
  }
  for (const path of values.set) sets.push({ ...(await externalSet(resolve(path))), external: true });

  const server = await startModelServer();
  try {
    const careful = await pipeline(server.baseUrl, "careful");
    const balanced = await pipeline(server.baseUrl, "balanced");
    const runs: SetRun[] = [];
    for (const { set, cases, external } of sets) {
      runs.push(await score(set, cases, careful, "careful", external));
      // A local set may mix languages; any English in it gets the comparison run.
      if (cases.some((c) => c.lang === "en")) runs.push(await score(set, cases, balanced, "balanced", external));
    }
    console.log(formatReport(runs));
    await writeFile(values.json, `${JSON.stringify(toJson(runs, new Date().toISOString()), null, 2)}\n`);
    console.log(`\neval: report written to ${values.json}`);
  } finally {
    await server.close();
  }
}

main().catch((error: unknown) => {
  console.error(`eval failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
