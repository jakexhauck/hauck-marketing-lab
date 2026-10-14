// The sales call playbook: two sections, and the prompts inside them.
//
// The sections are fixed here because they are the SHAPE of a sales call, not a
// preference: you find out what is wrong, then you say what you do about it.
// The prompts inside them are rows in sales_playbook_items (0074) and are
// entirely Jake's, edited on Sales > Playbook.
//
// There was a third, Objection handling. It never held anything but the
// placeholders it shipped with, and a column of invented objections next to two
// columns of the real script was a column Jake had to read past on every call.
// Cut in 0085. The database still ALLOWS the value, so putting it back is a
// line in this array rather than a migration.
//
// Pure: no Supabase, no React. Shared by the endpoint that writes the rows and
// the two pages that draw them, so a prompt can never be validated one way on
// its way in and another on its way out.

import { isAnswerKey, isValueFormat, type ValueFormat } from "./callFormula";

export type PlaybookSectionId = "discovery" | "pitch";

// What a row IS, which decides what it draws on the call.
//
//   question  a thing you ask. Tick, answer box, and optionally a key the
//             answer is saved under so later rows can use it.
//   script    a thing you say. Tick, no box, keeps its line breaks. This is the
//             pre-pitch recap and the identity tie-down: paragraphs, not
//             questions, and giving them an empty answer box made them look
//             unfinished all call.
//   calc      a number worked out from other answers. No tick, no box, nothing
//             to do: it is there to be read off.
//
// One column, three kinds. The alternative was three tables, which would have
// made "move this above that" a cross-table sort.
export type PlaybookRowKind = "question" | "script" | "calc";

export const PLAYBOOK_ROW_KINDS: PlaybookRowKind[] = ["question", "script", "calc"];

export function isPlaybookRowKind(value: unknown): value is PlaybookRowKind {
  return typeof value === "string" && (PLAYBOOK_ROW_KINDS as string[]).includes(value);
}

export interface PlaybookSectionDef {
  id: PlaybookSectionId;
  label: string;
  // The line under the heading, saying what the column is FOR. Three lists of
  // sentences look identical without it.
  blurb: string;
  // What the answer box under each prompt is asking for. Differs per section:
  // on Discovery you write down their answer, on Objections you write down
  // which rebuttal actually landed.
  placeholder: string;
}

// In the order the call runs. Order matters and is not stored: a playbook whose
// pitch could be dragged above its discovery would be a different call.
export const PLAYBOOK_SECTIONS: PlaybookSectionDef[] = [
  {
    id: "discovery",
    label: "Discovery",
    blurb: "Get the problem in their own words before you sell anything.",
    placeholder: "What they said",
  },
  {
    id: "pitch",
    label: "Pitch",
    blurb: "Say it back to them, then show what we do about it.",
    placeholder: "How it landed",
  },
];

export const PLAYBOOK_SECTION_IDS = PLAYBOOK_SECTIONS.map((s) => s.id);

export function isPlaybookSection(value: unknown): value is PlaybookSectionId {
  return typeof value === "string" && (PLAYBOOK_SECTION_IDS as string[]).includes(value);
}

export function playbookSection(id: string): PlaybookSectionDef | null {
  return PLAYBOOK_SECTIONS.find((s) => s.id === id) ?? null;
}

// A prompt is one line somebody reads mid-call, so it is capped at something
// you can take in at a glance. The hint under it gets the same room.
export const MAX_PROMPT = 240;
export const MAX_HINT = 240;
// A script line is a paragraph, not a question, so it gets room to be one and
// keeps the line breaks that make it readable at speed. Still plain text, still
// never markup: the cap and the control-character scrub are the whole guard,
// exactly as they are for a prompt.
export const MAX_SCRIPT = 1200;
// A category is a two or three word heading over a block of prompts, not a
// sentence. Capped short on purpose: it is drawn as a rule across a column.
export const MAX_CATEGORY = 60;

// Both fields are stored and RENDERED AS TEXT, never as markup. That is the
// trust boundary and it is why there is no HTML sanitizer here: the columns
// hold plain strings, and the only job of these two functions is to keep a
// stored prompt to one tidy line.
//
// Newlines, tabs and control characters become spaces rather than being
// rejected: they arrive from pasting out of a document, and refusing the paste
// would be a worse answer than tidying it. Scanned by code point rather than
// matched by a regex range, so this file holds no control characters itself.
function cleanLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, max);
}

// The same scrub, except newlines survive it.
//
// A script line is pasted out of a document and its shape is half of why it can
// be read at speed. Every other control character still becomes a space, and a
// run of blank lines collapses to one, so pasting cannot push the rest of the
// column off the screen.
function cleanBlock(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\n") {
      out += "\n";
      continue;
    }
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export function cleanPrompt(value: unknown): string {
  return cleanLine(value, MAX_PROMPT);
}

export function cleanScript(value: unknown): string {
  return cleanBlock(value, MAX_SCRIPT);
}

// Which of the two a row's text goes through. Kept here rather than at each
// call site so the endpoint and the page can never disagree about whether a
// given row is allowed its line breaks.
export function cleanText(kind: PlaybookRowKind, value: unknown): string {
  return kind === "script" ? cleanScript(value) : cleanPrompt(value);
}

export function cleanHint(value: unknown): string {
  return cleanLine(value, MAX_HINT);
}

export function cleanCategory(value: unknown): string {
  return cleanLine(value, MAX_CATEGORY);
}

// The key an answer is filed under, or "" for a row that files nothing.
//
// Refused rather than tidied, unlike the text above: a key is typed once and
// then referenced by hand in other rows, so quietly turning "Avg Ticket" into
// avg_ticket would leave Jake writing {Avg Ticket} in a prompt and wondering
// why nothing appeared. Lowercasing is the one exception, because it is
// unambiguous and it is the mistake everyone makes first.
export function cleanAnswerKey(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  if (candidate === "") return "";
  return isAnswerKey(candidate) ? candidate : null;
}

// ===== The answers that are there before anyone types =====

// Filled from the booking rather than asked for. They behave like any other
// key, so {name} works in a prompt on day one, and a playbook key may not
// shadow one: two sources for {name} would mean the strip and the prompts could
// disagree about who is on the phone.
export const RESERVED_KEYS: { key: string; label: string }[] = [
  { key: "name", label: "Their name" },
  { key: "first_name", label: "First name" },
  { key: "business", label: "Business name" },
  { key: "phone", label: "Phone" },
];

export const RESERVED_KEY_SET = new Set(RESERVED_KEYS.map((r) => r.key));

// ===== Tokens inside a prompt =====

// {goal} in the middle of a sentence. Split rather than replaced, so the page
// can draw a filled token differently from an empty one instead of building a
// string and losing which part came from where.
//
// An unknown or malformed brace is left as literal text: it is far more likely
// to be someone writing about braces than a token, and swallowing it would make
// text vanish off a prompt with nothing to explain it.
export type TextPart = { t: "text"; value: string } | { t: "token"; key: string };

const TOKEN = /\{([a-z][a-z0-9_]{0,23})\}/g;

export function splitTokens(text: string): TextPart[] {
  if (typeof text !== "string" || text === "") return [];
  const parts: TextPart[] = [];
  let last = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(text); m !== null; m = TOKEN.exec(text)) {
    if (m.index > last) parts.push({ t: "text", value: text.slice(last, m.index) });
    parts.push({ t: "token", key: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: "text", value: text.slice(last) });
  return parts;
}

// Every key a row's own words ask for. Used to tell Jake which prompts go blank
// when he retires the question that fills them.
export function tokensIn(text: string): string[] {
  return splitTokens(text)
    .filter((p): p is { t: "token"; key: string } => p.t === "token")
    .map((p) => p.key)
    .filter((key, i, all) => all.indexOf(key) === i);
}

// ===== What the pages get back =====

export interface PlaybookItem {
  id: string;
  section: PlaybookSectionId;
  // The heading this prompt sits under, or null for one that sits loose at the
  // bottom of its column. Null rather than an empty string: "no category" is
  // the absence of a link, not a category whose name happens to be blank.
  categoryId: string | null;
  // Question, script line, or calc. Everything below is read differently
  // depending on which.
  kind: PlaybookRowKind;
  // The words. A question on a question, the paragraph on a script line, and
  // the label beside the number on a calc.
  prompt: string;
  hint: string;
  // What the answer is filed under, or null for a row nothing refers back to.
  // On a calc it names the number itself, which is how one calc can be built
  // out of another.
  answerKey: string | null;
  // Calc rows only, and empty everywhere else.
  formula: string;
  // How a calc's number is drawn. Ignored on the other two kinds.
  format: ValueFormat;
  sortOrder: number;
  archivedAt: string | null;
}

export function cleanFormat(value: unknown): ValueFormat {
  return isValueFormat(value) ? value : "number";
}

// A row that has something to put in the facts strip: a question filed under a
// key, or any calc. Script lines never do.
export function keyedItems(items: readonly PlaybookItem[]): PlaybookItem[] {
  return items.filter((i) => !i.archivedAt && i.answerKey);
}

// A heading over a block of prompts, inside one column.
//
// Its own row rather than a string typed on each prompt (the way the cold call
// shelf files its assets), because a heading you can rename once and move as a
// block is the thing Jake asked for, and a free-typed string is neither: a typo
// silently splits a category in two and there is nothing to reorder.
export interface PlaybookCategory {
  id: string;
  section: PlaybookSectionId;
  name: string;
  sortOrder: number;
}

// The live items of one section, in Jake's order. Ties break on id so the order
// is stable rather than whatever the database felt like.
export function itemsForSection(
  items: readonly PlaybookItem[],
  section: PlaybookSectionId,
): PlaybookItem[] {
  return items
    .filter((i) => i.section === section && !i.archivedAt)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

// The categories of one section, in Jake's order.
export function categoriesForSection(
  categories: readonly PlaybookCategory[],
  section: PlaybookSectionId,
): PlaybookCategory[] {
  return categories
    .filter((c) => c.section === section)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

// One column, cut into blocks: each category with its prompts, in category
// order, and then whatever is not filed under anything.
//
// The loose block comes LAST and is only there when it has prompts in it. That
// ordering is the point of the whole feature: a column reads as the headings
// Jake wrote, with the not-yet-sorted remainder underneath, rather than opening
// on a pile of unfiled questions.
//
// An empty category is kept. It is a heading Jake has just made and is about to
// fill, and dropping it would make "add a category" look like it did nothing.
export interface PlaybookGroup {
  // Null is the loose block at the bottom.
  category: PlaybookCategory | null;
  items: PlaybookItem[];
}

export function groupItems(
  items: readonly PlaybookItem[],
  categories: readonly PlaybookCategory[],
  section: PlaybookSectionId,
): PlaybookGroup[] {
  const live = itemsForSection(items, section);
  const known = new Set(categoriesForSection(categories, section).map((c) => c.id));

  const groups: PlaybookGroup[] = categoriesForSection(categories, section).map((category) => ({
    category,
    items: live.filter((i) => i.categoryId === category.id),
  }));

  // A prompt whose category was deleted (on delete set null) or which points at
  // a category in another section is loose, not lost. Silently hiding it would
  // take a question off the call with nothing on screen to say why.
  const loose = live.filter((i) => !i.categoryId || !known.has(i.categoryId));
  if (loose.length > 0) groups.push({ category: null, items: loose });

  return groups;
}

// Where a row lands when it is moved one place up or down inside its list.
//
// Returns the two rows whose sort_order must swap, or null when the move is off
// the end of the list. Pure, so the "can I move this up" test on the button and
// the write that follows it can never disagree. Takes anything with an id and a
// sortOrder, because prompts and the category headings above them reorder the
// same way.
export function swapTargets<T extends { id: string; sortOrder: number }>(
  ordered: readonly T[],
  id: string,
  direction: -1 | 1,
): { a: T; b: T } | null {
  const index = ordered.findIndex((i) => i.id === id);
  if (index < 0) return null;
  const other = index + direction;
  if (other < 0 || other >= ordered.length) return null;
  return { a: ordered[index], b: ordered[other] };
}
