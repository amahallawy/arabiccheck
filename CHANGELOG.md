# Changelog

What changed in ArabicCheck, newest first. Each entry says what you notice
while writing, and names the issue that has the detail. Versions follow
[semver](https://semver.org/).

## [Unreleased]

Merged but not yet released. Each entry moves into the next version's section
when that version ships.

### The checking models download once, checked, from pinned sources

Still nothing to try in a browser. `npm run fetch-models` downloads the English
and Arabic models (about 18 MB) from exact, pinned versions and refuses any
file that doesn't match its recorded fingerprint, so what you run is exactly
what was reviewed. The runtime that executes the models is served from the
page's own address, never from a third-party site. Every shipped file and its
licence is listed in `NOTICE`. (#6)

### Groundwork for checking mixed Arabic and English text

Still nothing to try. The core every checker will share is built and tested:
it splits text into Arabic and English parts (diacritics, tatweel and
Arabic-Indic digits stay with the Arabic), gives each checker only its own
language, and makes sure accepting a fix changes only the word it was meant
for, and nothing at all if you have since edited that word. (#5)

### The project exists

The repository is set up with its README, licence (MIT) and conventions. There
is nothing to install yet. (#1)
