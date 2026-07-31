// The sales call playbook: three sections, and the prompts inside them.
//
// The sections are fixed here because they are the SHAPE of a sales call, not a
// preference: you find out what is wrong, you say what you do about it, you
// answer the reason they give for not doing it. The prompts inside them are
// rows in sales_playbook_items (0074) and are entirely Jake's, edited on
// Sales > Playbook.
//
// Pure: no Supabase, no React. Shared by the endpoint that writes the rows and
// the two pages that draw them, so a prompt can never be validated one way on
// its way in and another on its way out.

export type PlaybookSectionId = "discovery" | "pitch" | "objections";

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
  {
    id: "objections",
    label: "Objection handling",
    blurb: "What they say back, and the line that answers it.",
    placeholder: "What you answered",
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

export function cleanPrompt(value: unknown): string {
  return cleanLine(value, MAX_PROMPT);
}

export function cleanHint(value: unknown): string {
  return cleanLine(value, MAX_HINT);
}

// ===== What the pages get back =====

export interface PlaybookItem {
  id: string;
  section: PlaybookSectionId;
  prompt: string;
  hint: string;
  sortOrder: number;
  archivedAt: string | null;
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

// Where a row lands when it is moved one place up or down inside its section.
//
// Returns the two rows whose sort_order must swap, or null when the move is off
// the end of the list. Pure, so the "can I move this up" test on the button and
// the write that follows it can never disagree.
export function swapTargets(
  ordered: readonly PlaybookItem[],
  id: string,
  direction: -1 | 1,
): { a: PlaybookItem; b: PlaybookItem } | null {
  const index = ordered.findIndex((i) => i.id === id);
  if (index < 0) return null;
  const other = index + direction;
  if (other < 0 || other >= ordered.length) return null;
  return { a: ordered[index], b: ordered[other] };
}
