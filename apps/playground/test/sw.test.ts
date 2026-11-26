import { describe, expect, it } from "vitest";
import { cacheName, cacheVersion, handles, precacheUrls, staleCaches } from "../src/sw/logic.ts";

describe("precacheUrls", () => {
  it("lists the page's root and every built file, relative and sorted", () => {
    expect(
      precacheUrls(["assets/index-abc.js", "index.html", "models/ar/model.onnx", "ort/ort-wasm-simd-threaded.wasm"]),
    ).toEqual(["./", "assets/index-abc.js", "index.html", "models/ar/model.onnx", "ort/ort-wasm-simd-threaded.wasm"]);
  });

  it("leaves out the service worker itself, source maps and hidden files, and uses forward slashes", () => {
    expect(precacheUrls(["sw.js", "assets\\main.js", "assets/main.js.map", ".DS_Store", "models/.gitkeep"])).toEqual([
      "./",
      "assets/main.js",
    ]);
  });

  it("lists each file once", () => {
    expect(precacheUrls(["a.js", "a.js", "./a.js"])).toEqual(["./", "a.js"]);
  });
});

describe("cacheVersion", () => {
  it("is 16 hex characters that change with the lock, the files or the runtime", async () => {
    const base = await cacheVersion('{"schema":1}', ["a.js", "b.js"], "1.31.1");
    expect(base).toMatch(/^[0-9a-f]{16}$/);
    expect(await cacheVersion('{"schema":1}', ["b.js", "a.js"], "1.31.1")).toBe(base);
    expect(await cacheVersion('{"schema":2}', ["a.js", "b.js"], "1.31.1")).not.toBe(base);
    expect(await cacheVersion('{"schema":1}', ["a.js", "c.js"], "1.31.1")).not.toBe(base);
    expect(await cacheVersion('{"schema":1}', ["a.js", "b.js"], "1.32.0")).not.toBe(base);
  });
});

describe("caches", () => {
  it("names the cache by version", () => {
    expect(cacheName("0123456789abcdef")).toBe("arabiccheck-0123456789abcdef");
  });

  it("deletes only this app's older caches", () => {
    expect(staleCaches(["arabiccheck-old", "arabiccheck-new", "someone-else"], "arabiccheck-new")).toEqual([
      "arabiccheck-old",
    ]);
  });
});

describe("handles", () => {
  const origin = "https://check.example";

  it("answers GET requests to its own origin", () => {
    expect(handles({ method: "GET", url: "https://check.example/models/ar/model.onnx" }, origin)).toBe(true);
  });

  it("leaves other methods and other origins to the network, untouched", () => {
    expect(handles({ method: "POST", url: "https://check.example/x" }, origin)).toBe(false);
    expect(handles({ method: "GET", url: "https://cdn.example/x.js" }, origin)).toBe(false);
    expect(handles({ method: "GET", url: "http://check.example/x" }, origin)).toBe(false);
    expect(handles({ method: "GET", url: "not a url" }, origin)).toBe(false);
  });
});
