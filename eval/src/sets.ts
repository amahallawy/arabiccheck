import type { Lang } from "@arabiccheck/core";

/** One test case: a text and what it should read once corrected (the same text if nothing is wrong). */
export interface TestCase {
  readonly id: string;
  readonly lang: Lang;
  readonly text: string;
  readonly expected: string;
  readonly source: string;
}

export type SetKind = "errors" | "clean";

/** One entry of `eval/sets/sets.json`. */
export interface SetInfo {
  readonly name: string;
  /** A `.jsonl` file in `eval/sets/`. */
  readonly file: string;
  readonly lang: Lang;
  /** `errors`: sentences with marked mistakes. `clean`: correct text, for false alarms. */
  readonly kind: SetKind;
  readonly source: string;
  readonly licence: string;
  /** Who reviewed the set, and when (`YYYY-MM-DD`). Arabic sets only count once the owner has. */
  readonly reviewed?: { readonly by: string; readonly on: string };
}

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whitespace-separated tokens: the unit every metric counts. */
export const tokens = (text: string): string[] => text.split(/\s+/).filter((token) => token !== "");

function text(object: JsonObject, key: string, where: string): string {
  const value = object[key];
  if (typeof value !== "string") throw new Error(`${where}: ${key} must be a string`);
  return value;
}

function lang(object: JsonObject, where: string): Lang {
  const value = object["lang"];
  if (value !== "ar" && value !== "en") throw new Error(`${where}: lang must be "ar" or "en"`);
  return value;
}

/**
 * Reads a JSONL test set. M0's checkers only substitute words, so a case whose `text`
 * and `expected` differ in token count is rejected (AgDR-0004), as is a clean-set case
 * that expects any change.
 */
export function parseCases(content: string, setName: string, kind: SetKind): TestCase[] {
  const cases: TestCase[] = [];
  const ids = new Set<string>();
  content.split(/\r?\n/).forEach((raw, index) => {
    if (raw.trim() === "") return;
    const where = `${setName}:${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw new Error(`${where}: not valid JSON (${error instanceof Error ? error.message : String(error)})`, {
        cause: error,
      });
    }
    if (!isObject(value)) throw new Error(`${where}: each line must be a JSON object`);
    const testCase: TestCase = {
      id: text(value, "id", where),
      lang: lang(value, where),
      text: text(value, "text", where),
      expected: text(value, "expected", where),
      source: text(value, "source", where),
    };
    if (ids.has(testCase.id)) throw new Error(`${where}: duplicate id ${testCase.id}`);
    ids.add(testCase.id);
    const typed = tokens(testCase.text).length;
    const wanted = tokens(testCase.expected).length;
    if (typed === 0) throw new Error(`${where}: text is empty`);
    if (typed !== wanted) throw new Error(`${where}: text has ${typed} tokens but expected has ${wanted}`);
    if (kind === "clean" && testCase.expected !== testCase.text) {
      throw new Error(`${where}: a clean set's expected must equal its text`);
    }
    cases.push(testCase);
  });
  return cases;
}

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.jsonl$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates the parsed `eval/sets/sets.json`. */
export function parseManifest(value: unknown): SetInfo[] {
  if (!Array.isArray(value)) throw new Error("sets.json must be a list of sets");
  const names = new Set<string>();
  return value.map((entry: unknown, index): SetInfo => {
    const where = `sets.json[${index}]`;
    if (!isObject(entry)) throw new Error(`${where}: must be an object`);
    const name = text(entry, "name", where);
    if (names.has(name)) throw new Error(`${where}: duplicate name ${name}`);
    names.add(name);
    const file = text(entry, "file", where);
    if (!FILE_NAME.test(file)) throw new Error(`${where}: file must be a plain .jsonl file name`);
    const kind = entry["kind"];
    if (kind !== "errors" && kind !== "clean") throw new Error(`${where}: kind must be "errors" or "clean"`);
    const reviewed = entry["reviewed"];
    if (
      reviewed !== undefined &&
      !(isObject(reviewed) && typeof reviewed["by"] === "string" && typeof reviewed["on"] === "string" && DATE.test(reviewed["on"]))
    ) {
      throw new Error(`${where}: reviewed must be { "by": "<name>", "on": "YYYY-MM-DD" }`);
    }
    return {
      name,
      file,
      lang: lang(entry, where),
      kind,
      source: text(entry, "source", where),
      licence: text(entry, "licence", where),
      ...(reviewed === undefined ? {} : { reviewed: { by: String(reviewed["by"]), on: String(reviewed["on"]) } }),
    };
  });
}
