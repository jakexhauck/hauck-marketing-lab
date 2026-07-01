// Weekly / every-N-weeks recurrence, anchored to a weekday. Timezone-safe:
// all inputs and outputs are local "YYYY-MM-DD" and math is done on local Date
// at midnight, mirroring src/lib/jobsPipeline.ts. No monthly patterns (v1).

export interface RecurrenceRule {
  // 1 = weekly, 2 = biweekly, 4 = every 4 weeks, etc. Always >= 1.
  cadenceWeeks: number;
  // 0 = Sunday .. 6 = Saturday. The day every visit lands on.
  weekday: number;
  // Reference date the interval counts from, "YYYY-MM-DD". Should itself fall
  // on `weekday`; if not, the anchor's own weekday is normalized forward.
  anchorDate: string;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// Whole days between two local midnights (b - a), floor-safe.
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// The first visit on/after `anchor` that lands on `weekday` (normalizes an
// anchor whose weekday does not match).
function normalizedAnchor(rule: RecurrenceRule): Date {
  const a = fromIso(rule.anchorDate);
  const delta = (rule.weekday - a.getDay() + 7) % 7;
  return addDays(a, delta);
}

export function nextVisit(rule: RecurrenceRule, fromIso_: string): string {
  const weeks = Math.max(1, Math.trunc(rule.cadenceWeeks));
  const anchor = normalizedAnchor(rule);
  const from = fromIso(fromIso_);
  if (from <= anchor) return toIso(anchor);
  const diffDays = daysBetween(anchor, from); // > 0
  const periods = Math.ceil(diffDays / (weeks * 7));
  return toIso(addDays(anchor, periods * weeks * 7));
}

export function occurrences(
  rule: RecurrenceRule,
  startIso: string,
  endIso: string,
): string[] {
  const weeks = Math.max(1, Math.trunc(rule.cadenceWeeks));
  const end = fromIso(endIso);
  const out: string[] = [];
  let cur = fromIso(nextVisit(rule, startIso));
  while (cur <= end) {
    out.push(toIso(cur));
    cur = addDays(cur, weeks * 7);
  }
  return out;
}
