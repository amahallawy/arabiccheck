# Changelog

What changed in ArabicCheck, newest first. Each entry says what you notice
while writing, and names the issue that has the detail. Versions follow
[semver](https://semver.org/).

## [Unreleased]

Merged but not yet released. Each entry moves into the next version's section
when that version ships.

### A page to try the checkers

There is now something to try: run `npm run dev -w @arabiccheck/playground`
and type or paste Arabic, English or both. Each mistake is marked in your text,
line by line in its own direction, and listed with its fix and what kind of
mistake it is (for Arabic: hamza, taa marbuta, a sound-alike letter, …). Accept
one, ignore a word for as long as the page is open, or accept them all; only
the marked words change, and diacritics and spacing stay as you typed them.
Checking waits until you pause and runs in the background, so typing never
waits on it. The footer shows how long each model took to load and how long the
last check took. Works at phone width; "Try" buttons fill in sample text. (#8)

### We can measure how often the checkers are right

`npm run eval` scores both checkers on about 600 test sentences written for
ArabicCheck: English and Arabic sentences with typical mistakes, and correct
text to count wrong changes. It reports how many changes were right, how many
mistakes were caught, and how many correct words were wrongly changed per 1,000.
First numbers: about 99% of changes are right in both languages, 83% of English
and 77% of Arabic mistakes are caught, and no correct word was changed. The
Arabic numbers count once a native speaker has reviewed the Arabic sentences.
Research data such as QALB can be scored from your own copy without ever being
added to the project. (#10)

### Both checkers work, off the main thread

Still no page to type into (that's next), but the checking itself works. Mixed
Arabic and English text is split so each checker sees only its own language:
`ذهبت الى المدرسه في الرياظ` gets `إلى`, `المدرسة` and `الرياض`, each labelled with
the kind of mistake (hamza, taa marbuta, a sound-alike letter), and `a letter
form the bank` gets `from`. English runs in its careful mode, which changes
fewer correct words. Both checkers run in a background worker, so typing will
never wait on them; an answer for text you have since changed is thrown away,
and if one language's model fails to load, the other keeps working and you are
told which file failed. (#7)

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
