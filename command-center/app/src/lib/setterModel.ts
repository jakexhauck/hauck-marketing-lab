// Pure model helpers for the Setter Suite board (src/routes/admin/SetterSuite.tsx
// + src/components/admin/setter/*). No I/O, no React: everything here is a
// plain function of the API response so it stays unit-testable without a
// server or a browser.

// Whether a stage needs a setter to work it is computed server-side, once,
// in functions/api/admin/setter/pipelines.ts (shapeSetterPipeline) against
// the live stage name, and comes down on the wire as stage.needsDialing. It
// is deliberately not recomputed here: a second regex against the same
// stage name would just be a copy that can drift from the server's.

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

// Text label for how long a stale (warning-rail) lead has been waiting,
// e.g. "Waiting 26h" or "Waiting 3d". Same hour/day bucketing as timeAgo
// (src/lib/timeAgo.ts) but phrased as a fact for the card's chip vocabulary
// rather than a relative timestamp caption, since the rail's color alone
// isn't a reliable signal (color-blind setters, an easy-to-miss inset rail).
export function staleWaitingLabel(createdAt: string, now: number): string {
  const then = new Date(createdAt).getTime();
  if (Number.isNaN(then)) return "Waiting";
  const hr = Math.floor(Math.max(0, now - then) / (60 * 60 * 1000));
  if (hr < 24) return `Waiting ${hr}h`;
  return `Waiting ${Math.floor(hr / 24)}d`;
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
