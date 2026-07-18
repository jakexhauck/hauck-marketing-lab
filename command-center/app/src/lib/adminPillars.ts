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
  // Bento Bold header: a small kicker over the title, plus a one-line tagline.
  kicker: string;
  label: string;
  tagline: string;
  tabs: PillarTabDef[];
}

// The three tab-bearing pillars. Command (/admin) has no tab bar and Fulfillment
// (/admin/delivery) has its own cockpit, so neither appears here.
export const ADMIN_PILLARS: PillarDef[] = [
  {
    id: "acquisition",
    kicker: "Pillar",
    label: "Acquisition",
    tagline: "Getting new leads into the pipeline: the top of the value chain.",
    tabs: [
      { id: "leads", label: "Leads", ready: false },
      { id: "cold-call", label: "Cold Call", ready: false },
      { id: "sms", label: "SMS", ready: false },
    ],
  },
  {
    id: "sales",
    kicker: "Pillar",
    label: "Sales",
    tagline: "Turning leads into booked, paying work.",
    tabs: [{ id: "sales-data", label: "Sales Data", ready: true }],
  },
  {
    id: "operations",
    kicker: "Pillar",
    label: "Operations",
    tagline: "The internal systems and team capacity that keep everything else running.",
    tabs: [
      { id: "calculator", label: "Calculator", ready: false },
      { id: "time-audit", label: "Time Audit", ready: false },
      { id: "tasks", label: "Tasks", ready: false },
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
