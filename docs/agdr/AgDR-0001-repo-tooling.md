# AgDR-0001: Repo tooling — npm workspaces, TypeScript, Vite, Vitest, Playwright, GitHub Actions

**Status**: Proposed · **Date**: 2026-11-24 · **Decided by**: Claude (for owner review) · **Issue**: #3

## Context

M0 needs a few small packages (core, two checker adapters), one web page and
an evaluation runner, all TypeScript. Node 24 and npm 11 are installed; pnpm
is not. Company's values favour plain files over frameworks.

## Options

| Option | For | Against |
|---|---|---|
| **npm workspaces** | Already installed; enough for five packages | Slower installs than pnpm; looser dependency isolation |
| pnpm workspaces | Strict, fast, disk-efficient | Another tool for every contributor to install |
| Turborepo / Nx on top | Build caching, task graphs | Overkill at this size |
| Page in React / Svelte | Components, state helpers | A dependency and a build step for a page with one text box and a list |

## Decision

- **npm workspaces** at the root; packages under `packages/`, apps under `apps/`.
- **TypeScript** in strict mode, ES modules, one shared `tsconfig.base.json`.
- **Vite** builds the playground; the page is **plain TypeScript**, no UI framework.
- **Vitest** for unit tests; **Playwright** (Chromium) for the offline and
  no-third-party-requests test.
- **GitHub Actions** CI on every PR: install, typecheck, unit tests, build,
  and the Playwright test. Once it exists, CI becomes Marker 1 in `CLAUDE.md`.
- Dependencies are added with exact versions recorded in `package-lock.json`.

## Consequences

- Contributors need only Node and npm.
- Revisit pnpm or a task runner if the repo grows past roughly ten packages.
- Revisit a UI framework for the extension's settings page in M1 if it gets complex.
