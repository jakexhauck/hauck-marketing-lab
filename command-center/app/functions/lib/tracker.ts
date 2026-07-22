// Shared validation for the agency's daily tracker tables (Sales Data now; Cold
// Call, Cold SMS and the Time Audit next). Every one of those endpoints does the
// same three things: bound a month, prove the day is a real date, and turn a
// camelCase patch body into a snake_case column update it is willing to write.
//
// It lives here, apart from any endpoint, for one reason: these are the rules
// that decide what reaches the database, and rules that guard writes should be
// readable and testable on their own rather than buried in a handler.
//
// Two deliberate choices worth knowing before you reuse this:
//   - An emptied cell clears to NULL, it does not become 0. A day nobody logged
//     is not a day of zero calls, and the rate math divides by these numbers.
//   - An unknown key is ignored, but a known key with a bad value is a 400. A
//     stale client sending an extra field should not fail the write; a client
//     sending "-3 calls" should never be quietly stored.

export type TrackerFieldKind = "int" | "money" | "text";

// The wire contract for one tracker table: camelCase field name -> the column it
// writes and how to coerce it.
export type TrackerFieldSpec = Record<
  string,
  { column: string; kind: TrackerFieldKind }
>;

export type TrackerUpdateResult =
  | { update: Record<string, unknown> }
  | { error: string };

// Free text is capped so a stray paste cannot bloat a row (and, with one row per
// day, the whole month read).
const MAX_TEXT = 2000;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// True only for a plain "YYYY-MM-DD" that is also a real calendar date. The
// round-trip through Date is what rejects 2026-02-31, which the regex alone
// happily accepts. UTC so the check never shifts by a timezone.
export function isIsoDay(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DAY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

// The inclusive [first, last] day range of a "YYYY-MM" month, or null if that is
// not a month. Day 0 of the next month is the last day of this one, so February
// and leap years fall out for free.
export function monthWindow(
  month: unknown,
): { first: string; last: string } | null {
  if (typeof month !== "string" || !ISO_MONTH.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${y}-${pad2(m)}-01`, last: `${y}-${pad2(m)}-${pad2(lastDay)}` };
}

// Parse a typed numeric cell. Returns null for an emptied cell (clear), a number
// for a good value, or undefined for a value we refuse to store.
function toNumber(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return undefined;
    return raw;
  }
  if (typeof raw !== "string") return undefined;
  // Tolerate what a human types into a money cell: "$4,500.00".
  const cleaned = raw.trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

// Whitelist a patch body into a column update. Unknown keys are dropped; a
// recognised key with an unstorable value fails the whole write rather than
// silently landing a partial row.
export function buildTrackerUpdate(
  spec: TrackerFieldSpec,
  body: Record<string, unknown>,
): TrackerUpdateResult {
  const update: Record<string, unknown> = {};

  for (const [key, def] of Object.entries(spec)) {
    if (!(key in body)) continue;
    const raw = body[key];

    if (def.kind === "text") {
      if (raw === null || raw === undefined) {
        update[def.column] = null;
        continue;
      }
      if (typeof raw !== "string") return { error: `${key} must be text` };
      const trimmed = raw.trim();
      update[def.column] = trimmed ? trimmed.slice(0, MAX_TEXT) : null;
      continue;
    }

    const n = toNumber(raw);
    if (n === undefined) {
      return { error: `${key} must be a non-negative number` };
    }
    if (n === null) {
      update[def.column] = null;
      continue;
    }
    update[def.column] =
      def.kind === "int" ? Math.floor(n) : Math.round(n * 100) / 100;
  }

  if (Object.keys(update).length === 0) return { error: "no valid fields" };
  return { update };
}
