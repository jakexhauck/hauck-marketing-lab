import { DIAL_OUTCOMES, isDialOutcome } from "./coldCallDials";

// The cold caller's shelf: dialing script variations and everything else read
// mid-call. Pure, so the rules a script test is judged on are unit-tested and
// live in exactly one place.
//
// A "script" is a variation of the pitch and is the unit of the A/B test.
// An "sop" is how the job is done, read before and between calls rather than
// during one, so it gets a page instead of the floating panel (0061).
// "objections" is the single document reached for mid-sentence while somebody is
// talking. There is exactly one (0077 enforces it with a partial unique index),
// and it renders inside the script panel rather than behind a button of its own.
//
// They share a table because they are the same thing to everyone except the dial
// that references one.
//
// "asset" was the call shelf: "anything else read mid-call". In practice it held
// one document, objection handling, so 0077 gave that its own kind and archived
// the rest. The kind survives here ONLY so those archived rows still parse; it is
// not creatable, which is what CREATABLE_KINDS below is for.

export const ASSET_KINDS = ["script", "sop", "objections", "asset"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

// What the API will accept on a create. The retired shelf kind is absent, so a
// stale client cannot quietly repopulate a page that no longer exists.
export const CREATABLE_KINDS = ["script", "sop", "objections"] as const;

// The kinds filed under an owner-named heading. A script has no category (it is
// one flat list, because the A/B test compares all of them against each other),
// and neither does the objections document, of which there is one.
export function usesCategory(kind: AssetKind): boolean {
  return kind === "sop" || kind === "asset";
}

export function isAssetKind(value: unknown): value is AssetKind {
  return typeof value === "string" && (ASSET_KINDS as readonly string[]).includes(value);
}

export function isCreatableKind(value: unknown): value is (typeof CREATABLE_KINDS)[number] {
  return typeof value === "string" && (CREATABLE_KINDS as readonly string[]).includes(value);
}

// A Google Drive file id, as the SOP Hub reports them. Deliberately the same
// shape check the doc endpoint applies (functions/lib/driveDirect.ts), so a value
// this accepts is one that endpoint will also accept rather than 400 on later.
//
// Empty string means "clear the pointer and go back to the stored html", which is
// a legitimate thing to save, so it is handled by the caller rather than here.
export function isDriveFileId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{10,200}$/.test(value);
}

// Long enough for "Pattern interrupt, short version"; short enough that a name
// cannot be used to smuggle a paragraph into a picker.
export const MAX_NAME = 80;
export const MAX_CATEGORY = 60;

// Trim, collapse runs of whitespace, and cap. Returns "" for anything that is
// not usable as a name, which the endpoint treats as a refusal rather than
// storing a blank row nobody can identify later.
export function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
}

// Categories are compared for grouping, so they are normalised harder than
// names: "Objection Handling" and "objection handling  " must be one heading,
// not two that look identical in a list.
export function cleanCategory(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_CATEGORY);
}

export function sameCategory(a: string, b: string): boolean {
  return cleanCategory(a).toLowerCase() === cleanCategory(b).toLowerCase();
}

// One dial, reduced to what a script test needs to know about it.
export interface ScriptDialRow {
  script_id: string | null;
  outcome: string;
}

export interface ScriptStats {
  dials: number;
  pickups: number;
  booked: number;
  // Bookings per dial. Null below MIN_DIALS_FOR_RATE: see below.
  bookingRate: number | null;
}

// Below this, a variation reports counts and no percentage.
//
// Jake picks the script rather than the app rotating them, so the four will
// never get equal numbers, and one meeting booked out of four dials is 25% in
// exactly the way that means nothing. Withholding the number under a floor is
// the difference between a dashboard that informs and one that launders a hunch
// into the typography of a result.
export const MIN_DIALS_FOR_RATE = 25;

export function emptyStats(): ScriptStats {
  return { dials: 0, pickups: 0, booked: 0, bookingRate: null };
}

// Roll dials up per script.
//
// Counting rules are imported from coldCallDials rather than restated, so a
// "pickup" cannot come to mean one thing on the tracker and another here. A row
// whose outcome is not one the app knows is counted as a dial and nothing else:
// it happened, but we will not guess what it was.
export function statsByScript(rows: ScriptDialRow[]): Record<string, ScriptStats> {
  const out: Record<string, ScriptStats> = {};

  for (const row of rows) {
    if (!row.script_id) continue;
    const stats = (out[row.script_id] ??= emptyStats());
    stats.dials += 1;
    if (!isDialOutcome(row.outcome)) continue;
    if (DIAL_OUTCOMES[row.outcome].spoke) stats.pickups += 1;
    if (row.outcome === "booked") stats.booked += 1;
  }

  for (const stats of Object.values(out)) {
    stats.bookingRate = stats.dials >= MIN_DIALS_FOR_RATE ? stats.booked / stats.dials : null;
  }

  return out;
}

// Which variation is winning, and whether that is worth saying yet.
//
// Only variations past the floor are eligible, and a single eligible variation
// is not a winner: being the only one measured is not the same as being best.
export function leadingScript(
  stats: Record<string, ScriptStats>,
): { id: string; bookingRate: number } | null {
  const eligible = Object.entries(stats).filter(([, s]) => s.bookingRate !== null);
  if (eligible.length < 2) return null;

  let best: { id: string; bookingRate: number } | null = null;
  for (const [id, s] of eligible) {
    const rate = s.bookingRate as number;
    if (!best || rate > best.bookingRate) best = { id, bookingRate: rate };
  }
  // A tie at the top has no leader. Reporting either one would be a coin toss
  // dressed up as a finding.
  if (best && eligible.filter(([, s]) => s.bookingRate === best!.bookingRate).length > 1) {
    return null;
  }
  return best;
}

// Group assets under their headings, headings in Jake's order.
//
// Order comes from the lowest sort_order in each group rather than from the
// heading text, so moving one document to the top moves its whole section, which
// is what dragging a row appears to promise.
export interface GroupableAsset {
  category: string;
  sortOrder: number;
}

export function groupByCategory<T extends GroupableAsset>(
  assets: T[],
): { category: string; items: T[] }[] {
  const groups = new Map<string, { category: string; items: T[]; rank: number }>();

  for (const asset of assets) {
    const label = cleanCategory(asset.category) || "Uncategorised";
    const key = label.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(asset);
      existing.rank = Math.min(existing.rank, asset.sortOrder);
    } else {
      groups.set(key, { category: label, items: [asset], rank: asset.sortOrder });
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.rank - b.rank || a.category.localeCompare(b.category))
    .map(({ category, items }) => ({ category, items }));
}
