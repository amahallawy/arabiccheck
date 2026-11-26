// The playground's DOM layer: reads the text box, asks the worker, renders view.ts's output.
// Logic lives in view.ts (unit-tested); this file only wires it to the page (AgDR-0007).
// Every piece of the user's text is written with textContent, never as HTML.
import { apply, applyAll, type Suggestion } from "@arabiccheck/core";
import { createCheckerClient, type CheckResult, type StatusMessage } from "@arabiccheck/worker";
import { checkLine, debounce, kindLabel, moveOffset, paragraphs, shiftAfter, statusLine, visible } from "./view.ts";

const DEBOUNCE_MS = 250;

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`the page has no #${id}`);
  return element as T;
};

const textBox = byId<HTMLTextAreaElement>("text");
const marked = byId<HTMLDivElement>("marked");
const list = byId<HTMLUListElement>("list");
const empty = byId<HTMLParagraphElement>("empty");
const count = byId<HTMLSpanElement>("count");
const acceptAllButton = byId<HTMLButtonElement>("accept-all");
const busy = byId<HTMLParagraphElement>("busy");
const models = byId<HTMLParagraphElement>("models");
const timing = byId<HTMLParagraphElement>("timing");

const worker = new Worker(new URL("./checker.worker.ts", import.meta.url), { type: "module", name: "arabiccheck-checkers" });
const here = (path: string): string => new URL(path, document.baseURI).href;
const client = createCheckerClient(worker, {
  models: { en: here("models/en/"), ar: here("models/ar/") },
  wasmPaths: here("ort/"),
});

/** Suggestions from the latest answer, in the offsets of the text as it is now (as far as we know). */
let suggestions: readonly Suggestion[] = [];
/** Words the writer chose to ignore. Kept in memory only, for as long as the page is open. */
const ignored = new Set<string>();
const statuses: StatusMessage[] = [];
let lastResult: CheckResult | undefined;
let checking = 0;

client.onStatus((status) => {
  statuses.push(status);
  models.textContent = statusLine(statuses);
  models.classList.toggle("problem", statuses.some((s) => s.type === "load-error"));
});

async function check(text: string): Promise<void> {
  checking += 1;
  busy.hidden = false;
  try {
    const result = await client.check(text, ignored);
    if (result === undefined) return; // a newer check was asked for; its answer will render
    lastResult = result;
    // The answer is for `text`; if the writer has typed since, render() drops what no longer fits.
    suggestions = textBox.value === text ? result.suggestions : [];
    render();
  } finally {
    checking -= 1;
    busy.hidden = checking === 0;
  }
}

const scheduleCheck = debounce((text: string) => void check(text), DEBOUNCE_MS);

function render(): void {
  const text = textBox.value;
  const shown = visible(text, suggestions, ignored);

  marked.replaceChildren(
    ...paragraphs(text, shown).map((paragraph) => {
      const p = document.createElement("p");
      p.dir = "auto";
      if (paragraph.pieces.length === 0) p.append(document.createElement("br"));
      for (const piece of paragraph.pieces) {
        if (piece.mark === undefined) {
          p.append(piece.text);
          continue;
        }
        const s = shown[piece.mark];
        const mark = document.createElement("mark");
        mark.textContent = piece.text;
        if (s !== undefined) {
          mark.className = s.kind;
          mark.title = `${s.replacement} (${kindLabel(s)})`;
        }
        p.append(mark);
      }
      return p;
    }),
  );

  list.replaceChildren(...shown.map((s) => listItem(s)));
  count.textContent = String(shown.length);
  empty.hidden = shown.length > 0;
  empty.textContent = text.trim() === "" ? "Suggestions appear here as you type." : "No suggestions.";
  acceptAllButton.disabled = shown.length === 0;
  timing.textContent = checkLine(lastResult);
}

function listItem(s: Suggestion): HTMLLIElement {
  const item = document.createElement("li");
  item.className = `item ${s.kind}`;

  const words = document.createElement("p");
  words.className = "words";
  const typed = document.createElement("bdi");
  typed.className = "typed";
  typed.textContent = s.typed;
  const replacement = document.createElement("bdi");
  replacement.className = "replacement";
  replacement.textContent = s.replacement;
  words.append(typed, " → ", replacement);

  const label = document.createElement("p");
  label.className = "kind";
  label.textContent = kindLabel(s);

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(
    button("Accept", `Replace ${s.typed} with ${s.replacement}`, () => accept([s], apply(textBox.value, s))),
    button("Ignore", `Ignore ${s.typed} for this session`, () => ignore(s.typed)),
  );

  item.append(words, label, actions);
  return item;
}

function button(text: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.setAttribute("aria-label", label);
  b.addEventListener("click", onClick);
  return b;
}

/** Puts `next` in the text box after `applied` were accepted, keeping the caret and the other marks. */
function accept(applied: readonly Suggestion[], next: string): void {
  const before = textBox.value;
  if (next === before) return; // the word changed since it was checked: nothing to do
  const live = applied.filter((s) => before.slice(s.start, s.end) === s.typed);
  const { selectionStart, selectionEnd } = textBox;
  textBox.value = next;
  textBox.setSelectionRange(moveOffset(selectionStart, live), moveOffset(selectionEnd, live));
  suggestions = shiftAfter(suggestions, live);
  render();
  scheduleCheck.now(next);
}

function ignore(word: string): void {
  ignored.add(word);
  render();
}

acceptAllButton.addEventListener("click", () => {
  const shown = visible(textBox.value, suggestions, ignored);
  accept(shown, applyAll(textBox.value, shown));
});

textBox.addEventListener("input", () => {
  render();
  scheduleCheck(textBox.value);
});

/** Sample texts with known mistakes, from the spec's independent tests. */
const EXAMPLES: Readonly<Record<string, string>> = {
  ar: "ذهبت الى المدرسه في الرياظ، ثم سافرت الى جده لزياره صديقي.",
  en: "I got a letter form the bank and recieve it tomorow.",
  mixed: "اشتريت جهاز iPhone جديد من المتجر الى جانب البيت.\nThe new phone is great, but I feel week after the long trip.",
};

for (const example of document.querySelectorAll<HTMLButtonElement>("[data-example]")) {
  example.addEventListener("click", () => {
    const text = EXAMPLES[example.dataset["example"] ?? ""];
    if (text === undefined) return;
    textBox.value = text;
    suggestions = [];
    render();
    scheduleCheck.now(text);
    textBox.focus();
  });
}

render();
if (textBox.value !== "") scheduleCheck.now(textBox.value);
