/** One downloadable file, pinned by URL, size and hash. */
export interface LockedFile {
  /** Plain file name; the file is stored as `<out>/<set id>/<name>`. */
  readonly name: string;
  /** Must be `<source>/resolve/<revision>/<name>`. */
  readonly url: string;
  /** Size in bytes. */
  readonly size: number;
  /** Lowercase hex SHA-256 of the file's bytes. */
  readonly sha256: string;
}

/** The files one checker package needs, all from one pinned commit. */
export interface ModelSet {
  /** Folder name under the output directory, such as "en" or "ar". */
  readonly id: string;
  /** The npm package and version these files were made for, such as "tinyfix@0.1.1". */
  readonly package: string;
  /** `https://huggingface.co/<owner>/<repo>`. */
  readonly source: string;
  /** Full 40-character commit hash. Branches and tags can move; commits cannot. */
  readonly revision: string;
  /** The tag that pointed at `revision` when it was locked, for readers only. */
  readonly tag?: string;
  /** SPDX licence identifier of the files, also listed in NOTICE. */
  readonly license: string;
  readonly files: readonly LockedFile[];
}

/** The contents of `models.lock.json`. */
export interface Lock {
  readonly schema: 1;
  readonly sets: readonly ModelSet[];
}

export class LockError extends Error {
  override name = "LockError";
}

type JsonObject = Record<string, unknown>;

const SET_ID = /^[a-z][a-z0-9-]*$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
// Starts with a letter or digit, so "." and ".." are rejected, and no "/" or "\".
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const HF_SOURCE = /^https:\/\/huggingface\.co\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(path: string, problem: string): never {
  throw new LockError(`models.lock.json: ${path} ${problem}`);
}

function text(object: JsonObject, key: string, path: string): string {
  const value = object[key];
  if (typeof value !== "string" || value === "") fail(`${path}.${key}`, "must be a non-empty string");
  return value;
}

function parseFile(value: unknown, path: string, urlPrefix: string, names: Set<string>): LockedFile {
  if (!isObject(value)) fail(path, "must be an object");
  const name = text(value, "name", path);
  if (!FILE_NAME.test(name) || names.has(name)) {
    fail(`${path}.name`, "must be a unique plain file name (letters, digits, '.', '_', '-')");
  }
  names.add(name);
  const url = text(value, "url", path);
  if (url !== urlPrefix + name) fail(`${path}.url`, `must be ${urlPrefix + name}`);
  const size = value["size"];
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) {
    fail(`${path}.size`, "must be a positive whole number of bytes");
  }
  const sha256 = text(value, "sha256", path);
  if (!SHA256.test(sha256)) fail(`${path}.sha256`, "must be 64 lowercase hex characters");
  return { name, url, size, sha256 };
}

function parseSet(value: unknown, path: string, ids: Set<string>): ModelSet {
  if (!isObject(value)) fail(path, "must be an object");
  const id = text(value, "id", path);
  if (!SET_ID.test(id) || ids.has(id)) fail(`${path}.id`, "must be a unique lowercase name");
  ids.add(id);
  const pkg = text(value, "package", path);
  const source = text(value, "source", path);
  if (!HF_SOURCE.test(source)) fail(`${path}.source`, "must be https://huggingface.co/<owner>/<repo>");
  const revision = text(value, "revision", path);
  if (!COMMIT.test(revision)) {
    fail(`${path}.revision`, "must be a full 40-character commit hash, not a branch or tag");
  }
  const tag = value["tag"];
  if (tag !== undefined && (typeof tag !== "string" || tag === "")) {
    fail(`${path}.tag`, "must be a non-empty string when present");
  }
  const license = text(value, "license", path);
  const files = value["files"];
  if (!Array.isArray(files) || files.length === 0) fail(`${path}.files`, "must be a non-empty array");
  const names = new Set<string>();
  const urlPrefix = `${source}/resolve/${revision}/`;
  return {
    id,
    package: pkg,
    source,
    revision,
    ...(tag === undefined ? {} : { tag }),
    license,
    files: files.map((file, j) => parseFile(file, `${path}.files[${j}]`, urlPrefix, names)),
  };
}

/** Validates parsed `models.lock.json` content. Throws a `LockError` naming the first bad field. */
export function parseLock(value: unknown): Lock {
  if (!isObject(value)) fail("lock", "must be a JSON object");
  if (value["schema"] !== 1) fail("schema", "must be 1");
  const sets = value["sets"];
  if (!Array.isArray(sets) || sets.length === 0) fail("sets", "must be a non-empty array");
  const ids = new Set<string>();
  return { schema: 1, sets: sets.map((set, i) => parseSet(set, `sets[${i}]`, ids)) };
}
