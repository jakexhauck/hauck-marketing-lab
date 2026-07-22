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

// Link to a lead's contact record in the CRM, which is how a setter places a
// call: the CRM's own softphone owns the client's business number, so the lead
// sees that instead of the setter's personal handset (which is what a plain
// tel: link on this number used to give them).
//
// It lands on the contact record, not the dialer, because no query parameter
// exists to open the dialer pre-filled. The setter clicks the phone icon there.
//
// Returns null when either id is missing so the cockpit has one thing to branch
// on: a half-built URL would drop the setter on a CRM 404 mid-dial. The vendor
// domain is hardcoded deliberately (internal admin surface, staff-only); if a
// white-label domain is ever adopted, this line is the only edit.
export function ghlContactUrl(locationId: string, contactId: string): string | null {
  const loc = locationId.trim();
  const contact = contactId.trim();
  if (!loc || !contact) return null;
  return `https://app.gohighlevel.com/v2/location/${encodeURIComponent(loc)}/contacts/detail/${encodeURIComponent(contact)}`;
}

// Order pipelines by the numeric prefix the agency puts in their CRM names
// ("1) Lead Form Pipeline", "2) Funnel Pipeline"), so the switcher shows them
// in the intended sequence even though the UI strips the numbers from the
// labels. Unnumbered names sort after every numbered one, keeping their
// fetched order relative to each other (stable sort).
export function orderByNumberPrefix<T extends { name: string }>(pipelines: T[]): T[] {
  const num = (name: string): number => {
    const m = /^\s*(\d+)\)/.exec(name);
    return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
  };
  return [...pipelines].sort((a, b) => num(a.name) - num(b.name));
}

// A semantic color for a stage, derived from what the stage IS (matched on
// its name), so every column reads at a glance: fresh leads in brand indigo,
// the no-answer chain in amber, follow-ups in violet, booked/confirmed and
// completed work in green, long-term nurture in slate, dead ends in red.
// The CRM's own stage color (stage.color off the pipelines endpoint) wins
// when present; this is the fallback and the "depending on what it is" rule.
export function stageTone(stageName: string): string {
  const s = stageName.trim().toLowerCase();
  if (/trash|unqualified|uninterested|cancel|lost|dead/.test(s)) return "var(--danger)";
  if (/no answer/.test(s)) return "var(--warning)";
  if (/follow up|follow-up/.test(s)) return "#8b5cf6";
  if (/nurture/.test(s)) return "var(--text-faint)";
  // Fresh incoming work BEFORE the positive keywords: "Survey Completed No
  // Call Booked" contains both "completed" and "booked" and is still a brand-
  // new lead, not a win.
  if (/opted in|new lead|survey completed|hot lead/.test(s)) return "var(--brand)";
  if (/booked|confirmed|completed|customer|won|scheduled/.test(s)) return "var(--positive)";
  return "var(--brand)";
}

// Key for the session-local dial-attempt ticks (the cockpit's checkboxes,
// mirrored as a segment bar on the board card). Keyed by contact AND stage
// on purpose: when the automation moves the lead to a new stage, its ticks
// start fresh for that stage's dialing day.
export function dialCheckKey(contactId: string, stageName: string): string {
  return `${contactId}|${stageName.trim().toLowerCase()}`;
}

// Live speed-to-lead readout for a lead nobody has dialed yet: how long it
// has been sitting since it landed in the pipeline. Green under 5 minutes
// (the standard a form lead deserves), amber under an hour, red after that.
// Returns null for an unparseable timestamp, or once the lead has been
// dialed (attempts or session ticks), since the dial bar takes over then;
// keeping that branch here keeps the card render logic single-purpose.
export type SpeedToLead = { label: string; tone: "positive" | "warning" | "danger" };

const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;

export function speedToLead(
  createdAt: string,
  now: number,
  hasBeenDialed: boolean,
): SpeedToLead | null {
  if (hasBeenDialed) return null;
  const then = new Date(createdAt).getTime();
  if (Number.isNaN(then)) return null;
  const age = Math.max(0, now - then);
  const tone = age < 5 * MIN_MS ? "positive" : age < HOUR_MS ? "warning" : "danger";
  let label: string;
  if (age < HOUR_MS) label = `${Math.floor(age / MIN_MS)}m`;
  else if (age < DAY_MS) label = `${Math.floor(age / HOUR_MS)}h`;
  else label = `${Math.floor(age / DAY_MS)}d`;
  return { label, tone };
}

// The no-answer chain's re-dial rhythm: a lead who did not pick up gets
// called again 24 hours after landing in its No Answer stage. The card chip
// counts UP from stage entry so the setter can see how long the lead has
// sat; at 24 hours it flips to "due". Stage entry is approximated by the
// opportunity's updatedAt (the automation's stage move is what last touched
// it; contact-level tag writes do not bump it), falling back to createdAt.
export const NO_ANSWER_REDIAL_MS = 24 * 60 * 60 * 1000;

export function isNoAnswerStage(stageName: string | undefined | null): boolean {
  return !!stageName && /no answer/i.test(stageName);
}

export interface NoAnswerWait {
  // "40m" under an hour, "18h" under a day, then "1d 3h".
  label: string;
  // True once the 24-hour re-dial window has opened.
  due: boolean;
}

export function noAnswerWait(sinceIso: string, now: number): NoAnswerWait | null {
  const then = new Date(sinceIso).getTime();
  if (Number.isNaN(then)) return null;
  const ms = Math.max(0, now - then);
  const HOUR = 60 * 60 * 1000;
  let label: string;
  if (ms < HOUR) label = `${Math.floor(ms / (60 * 1000))}m`;
  else if (ms < DAY_MS) label = `${Math.floor(ms / HOUR)}h`;
  else {
    const days = Math.floor(ms / DAY_MS);
    const hours = Math.floor((ms - days * DAY_MS) / HOUR);
    label = hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  return { label, due: ms >= NO_ANSWER_REDIAL_MS };
}

// Median time-to-first-dial across the leads currently on the board whose
// FIRST dial landed at or after `sinceMs`. Computed client-side because
// setter_dials does not store the lead's created time; the board leads
// already carry both timestamps. Leads never dialed are excluded (they have
// no speed yet; the live chip is their surface), as are unparseable
// timestamps. Null when no lead qualifies.
export function medianSpeedToLeadMs(
  leads: Array<{ createdAt: string; firstDialedAt: string | null }>,
  sinceMs: number,
): number | null {
  const samples: number[] = [];
  for (const l of leads) {
    if (!l.firstDialedAt) continue;
    const dialed = new Date(l.firstDialedAt).getTime();
    const created = new Date(l.createdAt).getTime();
    if (Number.isNaN(dialed) || Number.isNaN(created) || dialed < sinceMs) continue;
    samples.push(Math.max(0, dialed - created));
  }
  if (!samples.length) return null;
  samples.sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  return samples.length % 2 ? samples[mid] : (samples[mid - 1] + samples[mid]) / 2;
}

// "4m" / "3h" / "2d" for a speed-to-lead duration on the scoreboard.
export function formatStlDuration(ms: number): string {
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  if (ms < HOUR) return `${Math.max(0, Math.floor(ms / MIN))}m`;
  if (ms < DAY_MS) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / DAY_MS)}d`;
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
