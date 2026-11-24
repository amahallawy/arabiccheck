# ArabicCheck

**Arabic-first, offline spelling and grammar checking for the browser — Arabic and English.**
Open source (MIT). Everything runs on your device: nothing you type is ever sent anywhere.

> **Status: pre-alpha.** The project is just starting. The first milestone is a
> playground page for trying the checkers; the browser extension comes after.

## Why

Good writing tools for Arabic are rare, and most checkers send your text to a
server. ArabicCheck aims to be a private, offline checker that treats Arabic as
a first-class language, while also covering English for people who write both.

## How it works

ArabicCheck stacks several small checkers, each running in the browser
(WebAssembly or WebGPU):

| Layer | What it catches | Arabic | English |
|---|---|---|---|
| Spelling | Words that don't exist | Dictionary + edit distance | Dictionary + edit distance |
| Real-word errors | Real words used in the wrong place (`form` → `from`, `الى` → `إلى`) | [tinyfix-ar](https://huggingface.co/ali77a/tinyfix-ar) | [tinyfix](https://huggingface.co/paperweight/tinyfix) |
| Grammar rules | Agreement, common constructions | Planned: Arabic rules as data | Planned: [Harper](https://github.com/elijah-potter/harper) |
| Neural grammar | Harder grammar errors | Research: a small offline model | Optional download |

It prefers **precision over recall**: it would rather miss a mistake than
change a word you meant.

## Roadmap

| Milestone | Scope |
|---|---|
| **M0** | Playground page: Arabic and English spelling plus real-word fixes, and an evaluation harness |
| **M1** | Browser extension (Chrome, Edge, Firefox) for text boxes and rich editors |
| **M2** | Grammar rules: Arabic rule pack v1, English through Harper |
| **M3** | A small offline Arabic grammar model, with training code and a data card |

## What offline means here

- No text leaves your device. No accounts, no telemetry.
- The network is used only to download models and dictionaries, which are
  checked against recorded hashes.
- Some things need large cloud models and are out of scope: rewriting for tone,
  and the deepest Arabic grammar checks for now.

## Development

You need Node 24 or newer and npm.

```sh
npm ci                  # install
npm run typecheck       # TypeScript, strict
npm test                # unit tests (npm run test:coverage for coverage)
npm run build           # build every package
```

Code lives in `packages/` (`core` is the shared, dependency-free part). Design
documents are in `docs/`, and the decisions behind them in `docs/agdr/`.

## Credits

ArabicCheck builds on open work, including tinyfix (paperweight), tinyfix-ar
(ali77a), Harper, and CAMeL Lab's Arabic error-correction research. Third-party
models and dictionaries keep their own licences, listed in `NOTICE` as they are
added.

## License

[MIT](LICENSE)
