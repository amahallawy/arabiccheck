// Spec story 5: the page works offline after the first load (SC-005), and it never talks to
// another origin, nor makes any request while checking (FR-007, SC-006). AgDR-0008.
import { expect, test, type Page } from "@playwright/test";

const SENTENCE = "ذهبت الى المدرسه في الرياظ";
const FIXES = ["إلى", "المدرسة", "الرياض"];

/** Waits until both checkers report they loaded. */
async function modelsLoaded(page: Page): Promise<void> {
  const models = page.locator("#models");
  await expect(models).toContainText("Arabic model: loaded", { timeout: 150_000 });
  await expect(models).toContainText("English model: loaded");
}

/** Types the text and waits for the expected suggestions. */
async function check(page: Page, text: string, fixes: readonly string[]): Promise<void> {
  await page.locator("#text").fill(text);
  await expect(page.locator("#list .replacement")).toHaveText([...fixes]);
}

test("after the first load, a reload with the network off still checks text", async ({ page, context }) => {
  await page.goto("/");
  await modelsLoaded(page);
  // The service worker is active and controls the page: everything is in its cache.
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  // One cache, holding the page, the scripts, the runtime and both models.
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith("arabiccheck-"));
    const cache = await caches.open(names[0] ?? "none");
    return { names, paths: (await cache.keys()).map((request) => new URL(request.url).pathname) };
  });
  expect(cached.names).toHaveLength(1);
  expect(cached.paths).toEqual(
    expect.arrayContaining([
      "/",
      "/index.html",
      "/ort/ort-wasm-simd-threaded.mjs",
      "/ort/ort-wasm-simd-threaded.wasm",
      "/models/ar/model.onnx",
      "/models/en/wrong-word.onnx",
    ]),
  );
  expect(cached.paths.filter((path) => path.startsWith("/assets/") && path.endsWith(".js")).length).toBeGreaterThan(0);

  await context.setOffline(true);
  await page.reload();
  await modelsLoaded(page);
  await check(page, SENTENCE, FIXES);
  await expect(page.locator("#models")).not.toContainText("failed");
});

test("every request goes to the page's own origin, and none is made while checking", async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? "").origin;
  const requests: string[] = [];
  // The context sees the page's, its workers' and the service worker's requests.
  context.on("request", (request) => requests.push(request.url()));

  await page.goto("/");
  await modelsLoaded(page);
  // Anything the page makes in memory (data: and blob: URLs) never leaves the device.
  const leaving = requests.filter((url) => !url.startsWith("data:") && !url.startsWith("blob:"));
  expect(leaving.length).toBeGreaterThan(0);
  expect(leaving.filter((url) => new URL(url).origin !== origin)).toEqual([]);

  const before = requests.length;
  await check(page, SENTENCE, FIXES);
  await check(page, `${SENTENCE}. I got a letter form the bank.`, [...FIXES, "from"]);
  expect(requests.slice(before)).toEqual([]);
});
