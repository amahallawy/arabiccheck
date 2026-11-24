import { describe, expect, it } from "vitest";
import { parseLock } from "../lib/lock.ts";

const REV = "8efdf5cd91b32584f4077aa0e8ecaf48f7651bef";
const SOURCE = "https://huggingface.co/paperweight/tinyfix";

function validLock(): any {
  // `any` so each test can break one field; parseLock takes `unknown`.
  return {
    schema: 1,
    sets: [
      {
        id: "en",
        package: "tinyfix@0.1.1",
        source: SOURCE,
        revision: REV,
        license: "MIT",
        files: [
          {
            name: "words.txt",
            url: `${SOURCE}/resolve/${REV}/words.txt`,
            size: 1282042,
            sha256: "a".repeat(64),
          },
        ],
      },
    ],
  };
}

describe("parseLock", () => {
  it("accepts a valid lock and keeps its contents", () => {
    const lock = validLock();
    lock.sets[0].tag = "v0.1.1";
    expect(parseLock(lock)).toEqual(lock);
  });

  it.each<[string, (lock: any) => void, string]>([
    ["not an object", (l) => Object.assign(l, { sets: "x" }), "sets"],
    ["an unknown schema", (l) => (l.schema = 2), "schema"],
    ["no sets", (l) => (l.sets = []), "sets"],
    ["a bad set id", (l) => (l.sets[0].id = "../en"), "sets[0].id"],
    ["a duplicate set id", (l) => l.sets.push(structuredClone(l.sets[0])), "sets[1].id"],
    ["a missing package", (l) => delete l.sets[0].package, "sets[0].package"],
    ["a non-Hugging Face source", (l) => (l.sets[0].source = "https://example.com/x/y"), "sets[0].source"],
    ["a tag instead of a commit", (l) => (l.sets[0].revision = "v1.0.0"), "sets[0].revision"],
    ["a non-string tag", (l) => (l.sets[0].tag = 1), "sets[0].tag"],
    ["a missing licence", (l) => (l.sets[0].license = ""), "sets[0].license"],
    ["no files", (l) => (l.sets[0].files = []), "sets[0].files"],
    ["a file entry that is not an object", (l) => (l.sets[0].files[0] = "words.txt"), "sets[0].files[0]"],
    ["a file name with a path", (l) => (l.sets[0].files[0].name = "../words.txt"), "sets[0].files[0].name"],
    ["a file name of dots", (l) => (l.sets[0].files[0].name = ".."), "sets[0].files[0].name"],
    ["a duplicate file name", (l) => l.sets[0].files.push({ ...l.sets[0].files[0] }), "sets[0].files[1].name"],
    [
      "a URL at another revision",
      (l) => (l.sets[0].files[0].url = `${SOURCE}/resolve/main/words.txt`),
      "sets[0].files[0].url",
    ],
    ["a size that is not a positive integer", (l) => (l.sets[0].files[0].size = 0), "sets[0].files[0].size"],
    ["a malformed hash", (l) => (l.sets[0].files[0].sha256 = "ABC"), "sets[0].files[0].sha256"],
  ])("rejects %s, naming the field", (_label, breakIt, path) => {
    const lock = validLock();
    breakIt(lock);
    expect(() => parseLock(lock)).toThrow(path);
  });

  it("rejects a value that is not an object at all", () => {
    expect(() => parseLock(null)).toThrow("lock");
    expect(() => parseLock([])).toThrow("lock");
  });
});
