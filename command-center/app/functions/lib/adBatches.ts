// The ad builder's shape and its input cleaning (0088).
//
// Shared by the two endpoints that write ad_batches and imported for its types
// by the browser, so the form and the server cannot disagree about what a batch
// is or how long a headline may be.
//
// Every field is plain text and is rendered as text. The cleaners here are the
// whole trust boundary: they cap length and flatten control characters. There is
// no HTML, no markdown and no sanitizer, because nothing downstream interprets
// this as markup.

export type AdBatchKind = "static" | "video";

export const AD_BATCH_KINDS: AdBatchKind[] = ["static", "video"];

export function isAdBatchKind(value: unknown): value is AdBatchKind {
  return value === "static" || value === "video";
}

// A competitor ad worth stealing from: who ran it, where to look at it, and what
// is actually working in it.
export interface AdCompetitor {
  name: string;
  url: string;
  notes: string;
}

export interface AdBatch {
  id: string;
  tenantId: string;
  kind: AdBatchKind;
  name: string;
  competitors: AdCompetitor[];
  angles: string[];
  // Exactly three of each, always. See the migration for why this is not a list.
  copy: [string, string, string];
  headlines: [string, string, string];
  // Empty on every static batch.
  hook: string;
  script: string;
  createdAt: string;
  updatedAt: string;
}

// How many copy and headline slots a batch has. Not configurable: three is the
// discipline this page exists to enforce.
export const AD_BATCH_SLOTS = 3;

// Caps. Generous enough that nobody meets them while writing normally, tight
// enough that a paste of a whole webpage cannot land in the table.
export const LIMITS = {
  name: 120,
  competitorName: 120,
  competitorUrl: 500,
  competitorNotes: 1000,
  angle: 300,
  copy: 3000,
  headline: 200,
  hook: 500,
  script: 8000,
  competitors: 25,
  angles: 25,
} as const;

// Every C0 control character plus DEL. Newlines and tabs are in here on purpose:
// cleanLine wants them gone, and cleanBlock puts newlines back before it runs.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
// The same set with newline spared, for text where line breaks are meaningful.
const CONTROL_CHARS_KEEP_NEWLINE = /[\u0000-\u0009\u000B-\u001F\u007F]/g;

// Single-line text: control characters (including newlines) become spaces, runs
// of whitespace collapse, then trim and cap. Used for everything a form draws
// as an <input>.
export function cleanLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Multi-line text: newlines survive, every other control character does not.
// Used for the primary copy, the competitor notes and the video script, where
// the line breaks are part of what was written.
export function cleanBlock(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS_KEEP_NEWLINE, " ")
    // Trailing spaces on a line go; the newline itself stays. Then three or more
    // blank lines collapse to one, so a paste out of a doc does not arrive with
    // half a screen of nothing in the middle of it.
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

// A competitor's link. Stored as typed unless it is plainly not a link, in
// which case it is dropped rather than saved: a broken href in the UI opens a
// tab on nothing and reads as the app losing the value.
export function cleanUrl(value: unknown): string {
  const raw = cleanLine(value, LIMITS.competitorUrl);
  if (!raw) return "";
  // A bare "facebook.com/ads/library/..." is what gets pasted about half the
  // time, and it is not this form's job to be pedantic about a scheme.
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return candidate.slice(0, LIMITS.competitorUrl);
  } catch {
    return "";
  }
}

export function cleanCompetitors(value: unknown): AdCompetitor[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, LIMITS.competitors)
    .map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      return {
        name: cleanLine(row.name, LIMITS.competitorName),
        url: cleanUrl(row.url),
        notes: cleanBlock(row.notes, LIMITS.competitorNotes),
      };
    })
    // A row with nothing in any of its three fields is a row the operator added
    // and walked away from. Dropping it on save keeps the list from growing an
    // empty tail every time the panel is opened.
    .filter((c) => c.name || c.url || c.notes);
}

export function cleanAngles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, LIMITS.angles)
    .map((a) => cleanLine(a, LIMITS.angle))
    .filter(Boolean);
}

// Coerce whatever arrived into exactly three slots, in order. A missing slot
// becomes empty rather than shifting the ones after it up: headline 3 must stay
// headline 3 when headline 2 is blanked.
export function cleanSlots(
  value: unknown,
  max: number,
  multiline: boolean,
): [string, string, string] {
  const list = Array.isArray(value) ? value : [];
  const at = (i: number) => (multiline ? cleanBlock(list[i], max) : cleanLine(list[i], max));
  return [at(0), at(1), at(2)];
}

// The database row, as selected.
export interface AdBatchRow {
  id: string;
  tenant_id: string;
  kind: string;
  name: string;
  competitors: unknown;
  angles: unknown;
  copy_1: string;
  copy_2: string;
  copy_3: string;
  headline_1: string;
  headline_2: string;
  headline_3: string;
  hook: string;
  script: string;
  created_at: string;
  updated_at: string;
}

export const AD_BATCH_SELECT =
  "id, tenant_id, kind, name, competitors, angles, copy_1, copy_2, copy_3, " +
  "headline_1, headline_2, headline_3, hook, script, created_at, updated_at";

// Row to API shape. The jsonb columns are cleaned on the way OUT as well as in:
// a row written before a cap changed still has to render, and rendering is not
// the place to discover that it cannot.
export function toAdBatch(row: AdBatchRow): AdBatch {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    kind: isAdBatchKind(row.kind) ? row.kind : "static",
    name: row.name,
    competitors: cleanCompetitors(row.competitors),
    angles: cleanAngles(row.angles),
    copy: [row.copy_1, row.copy_2, row.copy_3],
    headlines: [row.headline_1, row.headline_2, row.headline_3],
    hook: row.hook,
    script: row.script,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// What a PATCH may carry. Every field optional: the form saves one field at a
// time as it is left, so a request that named all fourteen would be a request
// that can overwrite a value the operator never touched.
export interface AdBatchPatch {
  name?: string;
  competitors?: AdCompetitor[];
  angles?: string[];
  copy?: string[];
  headlines?: string[];
  hook?: string;
  script?: string;
}

// Build the column update for a PATCH body. Returns only the columns the body
// actually named, so an absent key is left alone rather than blanked.
export function patchColumns(body: AdBatchPatch): Record<string, unknown> {
  const update: Record<string, unknown> = {};

  if (body.name !== undefined) update.name = cleanLine(body.name, LIMITS.name);
  if (body.competitors !== undefined) update.competitors = cleanCompetitors(body.competitors);
  if (body.angles !== undefined) update.angles = cleanAngles(body.angles);

  if (body.copy !== undefined) {
    const [a, b, c] = cleanSlots(body.copy, LIMITS.copy, true);
    update.copy_1 = a;
    update.copy_2 = b;
    update.copy_3 = c;
  }

  if (body.headlines !== undefined) {
    const [a, b, c] = cleanSlots(body.headlines, LIMITS.headline, false);
    update.headline_1 = a;
    update.headline_2 = b;
    update.headline_3 = c;
  }

  // Accepted on a static batch too. Refusing them would mean the endpoint has
  // to know which kind a row is before it can validate, for two fields whose
  // only cost when wrong is that nothing draws them.
  if (body.hook !== undefined) update.hook = cleanLine(body.hook, LIMITS.hook);
  if (body.script !== undefined) update.script = cleanBlock(body.script, LIMITS.script);

  return update;
}
