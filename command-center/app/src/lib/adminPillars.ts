// Pure config + helpers for the admin pillar pages (/admin/pillar/:pillarId).
// Kept out of the component so the per-pillar tab model and the ?tab= query
// resolution stay testable without React or the router. Mirrors the shape of
// deliveryCockpit.ts (the Fulfillment cockpit's tab config).
//
// A tab ships as an honest placeholder (ready:false) until its surface plan
// builds the real body, at which point that plan flips its own flag. Sales Data
// is built; Leads, Cold Call, SMS, Calculator, Time Audit and Tasks are not yet.
// Nothing here fabricates data.

export type PillarId = "acquisition" | "sales" | "operations";

export interface PillarTabDef {
  id: string;
  label: string;
  // false = an honest "coming in a later phase" placeholder body.
  ready: boolean;
}

export interface PillarDef {
  id: PillarId;
  label: string;
  tabs: PillarTabDef[];
}

// The three tab-bearing pillars. Command (/admin) has no tab bar and Fulfillment
// (/admin/delivery) has its own cockpit, so neither appears here.
export const ADMIN_PILLARS: PillarDef[] = [
  {
    id: "acquisition",
    label: "Acquisition",
    // Leads used to sit here as a sibling of Cold Call. It moved inside Cold
    // Call (lib/coldCallPages), because the prospect book only exists to be
    // dialed: two Leads pages meant two answers to "which list is the real one".
    //
    // It is back, and the old objection is answered rather than ignored: this
    // Leads tab is a SOURCING table, not a second prospect book. Nothing is
    // dialed from it. A row leaves it by being ticked and sent, at which point it
    // becomes a GoHighLevel contact and, for the call channel, a row in the Cold
    // Call book, which remains the only list anyone works.
    //
    // It sits LAST rather than first despite being first in the funnel, because
    // the first tab is the pillar's landing page and Cold Call is the one opened
    // daily. Sourcing is a thing you go to deliberately.
    tabs: [
      { id: "cold-call", label: "Cold Call", ready: true },
      { id: "sms", label: "SMS", ready: true },
      { id: "leads", label: "Leads", ready: true },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    // Sales Calls leads the pillar. Sales Data is the month in aggregate, and
    // it is read; Sales Calls is the meetings themselves, and it is worked.
    // The page with a job on it comes first.
    //
    // Sales Pipeline sits between them: it is where the outcomes recorded on
    // Sales Calls land, so it reads as the next step from that page rather than
    // as a third unrelated view. Read only.
    //
    // A Cold Call Data tab used to sit here as a "channel" page, the dialing
    // half of the funnel this pillar reads the other end of. It is gone: the
    // same month, agency-wide, was already on Acquisition > Cold Call > Tracker
    // with the caller selector on "Agency", and one number with two pages is one
    // page too many. Sales is the selling now, calendar through to cash.
    tabs: [
      { id: "calls", label: "Sales Calls", ready: true },
      { id: "pipeline", label: "Sales Pipeline", ready: true },
      { id: "sales-data", label: "Sales Data", ready: true },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    // Business Health leads the pillar: it was the Command home until Command
    // became the shortcut launcher, and it is the page you open Operations for.
    tabs: [
      { id: "business-health", label: "Business Health", ready: true },
      { id: "calculator", label: "Calculator", ready: true },
      { id: "time-audit", label: "Time Audit", ready: true },
      { id: "tasks", label: "Tasks", ready: true },
      { id: "sops", label: "SOPs", ready: true },
    ],
  },
];

const BY_ID = new Map<string, PillarDef>(ADMIN_PILLARS.map((p) => [p.id, p]));

export function isPillarId(id: string | null | undefined): id is PillarId {
  return !!id && BY_ID.has(id);
}

// The pillar for an id, or null when the id is unknown.
export function getPillar(id: string | null | undefined): PillarDef | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

// The tabs for a pillar, or [] for an unknown id.
export function tabsFor(pillar: PillarId): PillarTabDef[] {
  return BY_ID.get(pillar)?.tabs ?? [];
}

// Resolve a raw ?tab= value against a pillar to a known tab id, else the
// pillar's first (default) tab.
export function resolvePillarTab(
  pillar: PillarId,
  param: string | null | undefined,
): string {
  const tabs = tabsFor(pillar);
  if (param && tabs.some((t) => t.id === param)) return param;
  return tabs[0].id;
}

// The "coming soon" copy for a not-yet-built pillar tab.
export function placeholderCopy(label: string): string {
  return `${label} is coming in a later phase.`;
}
