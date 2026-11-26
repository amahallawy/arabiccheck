import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheName, cacheVersion, handles, precacheUrls, staleCaches } from "../src/sw/logic.ts";
import { untilActive } from "../src/sw/register.ts";

/** A stand-in for a ServiceWorker: a state and "statechange" events. */
class FakeWorker extends EventTarget {
  constructor(public state: string) {
    super();
  }
  become(state: string): void {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

describe("untilActive", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is done at once when a worker is already active, or none is installing", async () => {
    expect(await untilActive({ active: {}, installing: null, waiting: null }, 1000)).toBe("active");
    expect(await untilActive({ active: null, installing: null, waiting: null }, 1000)).toBe("active");
  });

  it("is done at once when the installing worker has already finished, either way", async () => {
    expect(await untilActive({ active: null, installing: new FakeWorker("activated"), waiting: null }, 1000)).toBe("active");
    expect(await untilActive({ active: null, installing: null, waiting: new FakeWorker("redundant") }, 1000)).toBe("redundant");
  });

  it("waits for the installing worker to activate, or to fail", async () => {
    const installing = new FakeWorker("installing");
    const done = untilActive({ active: null, installing, waiting: null }, 1000);
    installing.become("installed");
    installing.become("activated");
    expect(await done).toBe("active");

    const failing = new FakeWorker("installing");
    const failed = untilActive({ active: null, installing: failing, waiting: null }, 1000);
    failing.become("redundant");
    expect(await failed).toBe("redundant");
  });

  it("gives up after the timeout, so checking is never blocked for good", async () => {
    vi.useFakeTimers();
    const done = untilActive({ active: null, installing: new FakeWorker("installing"), waiting: null }, 1000);
    vi.advanceTimersByTime(1000);
    expect(await done).toBe("timeout");
  });
});

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

  it("escapes characters that would break a URL", () => {
    expect(precacheUrls(["models/a b#1.onnx", "models/ع.txt"])).toEqual(["./", "models/%D8%B9.txt", "models/a%20b%231.onnx"]);
  });
});

describe("cacheVersion", () => {
  const base = { lock: '{"schema":1}', files: ["a.js", "b.js"], runtime: "1.31.1", code: "self.x=1" };

  it("is 16 hex characters that change with the lock, the files, the runtime or the worker's code", async () => {
    const version = await cacheVersion(base);
    expect(version).toMatch(/^[0-9a-f]{16}$/);
    expect(await cacheVersion({ ...base, files: ["b.js", "a.js"] })).toBe(version);
    expect(await cacheVersion({ ...base, lock: '{"schema":2}' })).not.toBe(version);
    expect(await cacheVersion({ ...base, files: ["a.js", "c.js"] })).not.toBe(version);
    expect(await cacheVersion({ ...base, runtime: "1.32.0" })).not.toBe(version);
    expect(await cacheVersion({ ...base, code: "self.x=2" })).not.toBe(version);
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
