# AgDR-0008: Offline — a build-generated service worker, Playwright end-to-end tests in CI

**Status**: Proposed · **Date**: 2026-11-26 · **Decided by**: Claude, plan approved by the owner ("go", 2026-11-26) · **Issue**: #9

## Context

Story 5 (#9): after the first load the page must work with the network off
(SC-005), and it must never talk to another origin, nor make any request while
checking (FR-007, SC-006), proven by an automated test. The design asks for a
small hand-written service worker; AgDR-0001 already chose Playwright
(Chromium) for this test. Open choices:

1. How the service worker learns which files to cache, when Vite gives the
   page's scripts hashed names at build time.
2. How its cache is versioned, so new models or a new build replace the old.
3. How to avoid downloading the models twice on a first visit (once by the
   worker, once by the service worker's install).
4. Which Playwright version, and how CI gets a browser.

## Options

| Choice | Options | Picked |
|---|---|---|
| Building the service worker | Workbox / vite-plugin-pwa (new dependencies); cache whatever is fetched at run time, no list; **a small Vite plugin that emits `sw.js` with the built file list** | Own plugin |
| Cache version | Build time; **SHA-256 of `models.lock.json`, the built file names and the onnxruntime-web version** | Content-derived |
| Double download | Accept it; **register the service worker first and start the checker worker once it is active** | Wait for it |
| Where the tests run | `vite dev`; **`vite preview` of the production build** | Production build |
| Playwright | Latest (1.65.1, 13 days old); **1.65.0 (2026-11-05)** | 1.65.0 |

## Decision

- **`src/sw/logic.ts`** holds the service worker's decisions as pure,
  unit-tested functions: the list of URLs to cache, the cache name, which
  old caches to delete, and which requests it answers (GET to its own origin
  only; everything else passes through untouched). **`src/sw/sw.ts`** is the
  worker itself, wiring those to `install`, `activate` and `fetch`.
- **The plugin** (`plugins/service-worker.ts`, used by `vite.config.ts` in
  `vite build` only) emits `sw.ts` as `sw.js` at the site root, and fills in
  the list (every built file, plus everything in `public/`: `ort/` and
  `models/`) and the version. The version is the first 16 hex characters of a
  SHA-256 over `models.lock.json`, the sorted file names and the
  onnxruntime-web version, so a model or code change makes a new cache and
  the old one is deleted on activation.
- **Fetch** is cache-first for the page's own files, with the network as a
  fallback (whose answer is cached). A navigation that misses falls back to
  the cached page. Nothing from another origin is ever fetched or cached by
  the service worker.
- **The page registers it in production builds only** (`import.meta.env.PROD`;
  the dev server keeps working uncached) and starts the checker worker once
  the service worker is active, so the models download once, into its cache.
  If registration fails, or the browser has no service workers, the page
  starts the worker at once and simply isn't available offline.
- **Playwright `@playwright/test@1.65.0`** (exact; 1.65.1 was 13 days old),
  Chromium only. `npm run test:e2e` builds nothing itself; it runs against
  `vite preview` of the built page. Two tests: offline reload still checks,
  and every request goes to the page's own origin, none while checking. CI
  installs Chromium with `npx playwright install --with-deps chromium`,
  caching the browser by Playwright's version, and runs the tests after the
  build in the same job, so Marker 1's check name doesn't change.

## Consequences

- No new runtime dependency; one dev dependency (Playwright) and a ~150 MB
  browser download in CI on a cache miss.
- The first visit takes as long as the model download before the first
  check, as it already did; later visits start from the cache.
- A new version takes over as soon as it is installed (`skipWaiting`). Hashed
  file names mean an open page never asks for a file the new cache lacks
  except a lazily loaded chunk, and the page loads none.
- SC-004 (first load under 25 MB) holds only if the server compresses files
  (about 15 MB gzipped against 33 MB raw); measuring it is left to hosting.
