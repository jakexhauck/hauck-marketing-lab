// Pure model helpers for the Setter Suite board (src/routes/admin/SetterSuite.tsx
// + src/components/admin/setter/*). No I/O, no React: everything here is a
// plain function of the API response so it stays unit-testable without a
// server or a browser.

// A stage's live GHL name flags a setter needs to work it, matched purely by
// text against the live stage name. No mapping table to keep in sync: if the
// pipeline is renamed in the CRM the flag follows on the very next load.
// Mirrors functions/api/admin/setter/pipelines.ts:shapeSetterPipeline exactly.
export const needsDialing = (stageName: string): boolean => /needs dialing/i.test(stageName);

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SetterRailLead {
  attempts: number;
  contacted: boolean;
  createdAt: string;
}

// True once a lead has sat in a needs-dialing stage for over 24 hours without
// ever being spoken to. Independent of attempts: a lead dialed four times and
// still never answered is "stale" here too, the never-dialed case below is
// the separate, more urgent one.
export function isStaleUncontacted(
  lead: SetterRailLead,
  stageNeedsDialing: boolean,
  now: number,
): boolean {
  if (!stageNeedsDialing || lead.contacted) return false;
  const createdAt = new Date(lead.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;
  return now - createdAt > DAY_MS;
}

export type CardRail = "danger" | "warning" | null;

// The card's inset rail tone. Never-dialed (danger) always wins over stale
// (warning) when both hold, since it is the more urgent state for a setter
// to notice first.
export function cardRail(lead: SetterRailLead, stageNeedsDialing: boolean, now: number): CardRail {
  if (lead.attempts === 0) return "danger";
  if (isStaleUncontacted(lead, stageNeedsDialing, now)) return "warning";
  return null;
}

// Dial outcomes come back from the API as the setter_dials enum (booked,
// not_interested, no_answer, reschedule, bad_lead). This is display
// formatting of an internal enum, not a stage name, so title-casing it is
// fine (unlike stage names, which must render verbatim).
export function formatOutcome(outcome: string): string {
  return outcome
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
