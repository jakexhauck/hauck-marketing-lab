// The ad builder's shape and its input cleaning (0091).
//
// This replaces adBatches.ts (0088/0089). The batch is gone: rounds, the
// static/video split, the hook and the script, the name of a round, and Master
// all went with it. What is left is ONE living workspace per client, drawn as
// three pages:
//
//   Copy & Angles   competitors, angles, three primaries, three headlines
//   Ads             a flat list of ads, each a free-text type and a creative
//   Lead Form       drafts of Meta Instant Forms, in ad_lead_forms (0090)
//
// WHY the round went away: it was a guess at how the work is organised, and the
// answer was that it is not. There is the copy that is current and the ads that
// are running, and looking back at a superseded round is not a thing that
// happens often enough to pay for picking one before every edit. A flat set is
// always the current set, so nothing has to be selected before anything can be
// written.
//
// The cost is real and was accepted knowingly: there is no history. Overwriting
// last month's primary copy loses it. If that ever bites, the fix is a snapshot
// table, not a return to rounds.
//
// Every field is plain text and is rendered as text. The cleaners here are the
// whole trust boundary: they cap length and flatten control characters. There is
// no HTML, no markdown and no sanitizer, because nothing downstream interprets
// this as markup. Imported by the browser too, so the form and the server cannot
// disagree about what a workspace is or how long a headline may be.

// A competitor ad worth stealing from: who ran it, where to look at it, and what
// is actually working in it.
export interface AdCompetitor {
  name: string;
  url: string;
  notes: string;
}

// One ad. `type` is free text and carries what used to be the batch kind:
// "video" is a type now, sitting beside "before and after" and "testimonial".
//
// There is no copy on an ad. The three primaries and three headlines live on
// the workspace and are shared across every ad, because one set of text
// rotated over several creatives is how the round is actually run.
export interface AdItem {
  type: string;
  // A Google Drive file id from the client's creatives folder, or empty.
  creativeId: string;
  // The file's name when it was linked. Only read when Drive no longer lists
  // the file, so a binned creative still reads as a name and not an id.
  creativeName: string;
}

export interface AdWorkspace {
  tenantId: string;
  competitors: AdCompetitor[];
  angles: string[];
  ads: AdItem[];
  // Exactly three of each, always. The discipline is the feature: three
  // primaries and three headlines is what gets launched, and an array with an
  // Add button quietly becomes nine of each by March. A blank one is allowed,
  // a fourth one is not.
  copy: [string, string, string];
  headlines: [string, string, string];
  updatedAt: string | null;
}

// How many copy and headline slots there are. Not configurable.
export const AD_SLOTS = 3;

// Caps. Generous enough that nobody meets them while writing normally, tight
// enough that a paste of a whole webpage cannot land in the table.
export const LIMITS = {
  competitorName: 120,
  competitorUrl: 500,
  competitorNotes: 1000,
  angle: 300,
  copy: 3000,
  headline: 200,
  competitors: 25,
  angles: 25,
  // A client's live ad list. Sixty is far past any real one and exists only so
  // a malformed body cannot write an unbounded list.
  ads: 60,
  adType: 120,
  creativeName: 300,
} as const;

// Every C0 control character plus DEL. Newlines and tabs are in here on purpose:
// cleanLine wants them gone, and cleanBlock puts newlines back before it runs.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
// The same set with newline spared, for text where line breaks are meaningful.
const CONTROL_CHARS_KEEP_NEWLINE = /[\u0000-\u0009\u000B-\u001F\u007F]/g;

// Single-line text: control characters (including newlines) become spaces, runs
// of whitespace collapse, then trim and cap. Used for everything drawn as an
// <input>. Shared with adLeadForms.ts.
export function cleanLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Multi-line text: newlines survive, every other control character does not.
// Used for the primary copy and the competitor notes, where the line breaks are
// part of what was written.
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

// A link. Stored as typed unless it is plainly not a link, in which case it is
// dropped rather than saved: a broken href opens a tab on nothing and reads as
// the app losing the value.
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
    // and walked away from.
    .filter((c) => c.name || c.url || c.notes);
}

export function cleanAngles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, LIMITS.angles)
    .map((a) => cleanLine(a, LIMITS.angle))
    .filter(Boolean);
}

// A Drive file id. Same shape driveDirect enforces, restated here rather than
// imported: that module carries an OAuth client and a Supabase dependency, and
// this one is imported by the browser.
function isDriveFileId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && /^[A-Za-z0-9_-]+$/.test(value);
}

export function cleanAds(value: unknown): AdItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, LIMITS.ads)
    .map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      // An id that is not a Drive id is dropped rather than stored. It would
      // only ever resolve to a broken tile, and the ad itself is still worth
      // keeping: the type is what the operator actually wrote.
      const creativeId = isDriveFileId(row.creativeId) ? row.creativeId : "";
      return {
        type: cleanLine(row.type, LIMITS.adType),
        creativeId,
        // Never a name without an id. A label with nothing behind it is a tile
        // that cannot be opened and cannot be re-linked.
        creativeName: creativeId ? cleanLine(row.creativeName, LIMITS.creativeName) : "",
      };
    })
    // A row with no type and no creative is an Add nobody filled in.
    .filter((a) => a.type || a.creativeId);
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
export interface AdWorkspaceRow {
  tenant_id: string;
  competitors: unknown;
  angles: unknown;
  ads: unknown;
  copy_1: string;
  copy_2: string;
  copy_3: string;
  headline_1: string;
  headline_2: string;
  headline_3: string;
  updated_at: string;
}

export const AD_WORKSPACE_SELECT =
  "tenant_id, competitors, angles, ads, copy_1, copy_2, copy_3, " +
  "headline_1, headline_2, headline_3, updated_at";

// Row to API shape. The jsonb columns are cleaned on the way OUT as well as in:
// a row written before a cap changed still has to render, and rendering is not
// the place to discover that it cannot.
export function toAdWorkspace(row: AdWorkspaceRow): AdWorkspace {
  return {
    tenantId: row.tenant_id,
    competitors: cleanCompetitors(row.competitors),
    angles: cleanAngles(row.angles),
    ads: cleanAds(row.ads),
    copy: [row.copy_1, row.copy_2, row.copy_3],
    headlines: [row.headline_1, row.headline_2, row.headline_3],
    updatedAt: row.updated_at,
  };
}

// A client who has never been written for has no row, and that is not an error.
// The GET answers with this rather than a 404, so the three pages open ready to
// type instead of showing a state the operator has to clear.
export function emptyWorkspace(tenantId: string): AdWorkspace {
  return {
    tenantId,
    competitors: [],
    angles: [],
    ads: [],
    copy: ["", "", ""],
    headlines: ["", "", ""],
    updatedAt: null,
  };
}

// What a PATCH may carry. Every field optional: each page saves one block at a
// time as it is left, so a request naming all of them could overwrite a value
// the operator never touched.
export interface AdWorkspacePatch {
  competitors?: AdCompetitor[];
  angles?: string[];
  ads?: AdItem[];
  copy?: string[];
  headlines?: string[];
}

// Build the column update for a PATCH body. Returns only the columns the body
// actually named, so an absent key is left alone rather than blanked.
export function patchColumns(body: AdWorkspacePatch): Record<string, unknown> {
  const update: Record<string, unknown> = {};

  if (body.competitors !== undefined) update.competitors = cleanCompetitors(body.competitors);
  if (body.angles !== undefined) update.angles = cleanAngles(body.angles);
  if (body.ads !== undefined) update.ads = cleanAds(body.ads);

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

  return update;
}
