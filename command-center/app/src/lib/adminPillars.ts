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
    // It sits FIRST (Jake, 2026-08-24): Leads above Cold Call and SMS, in the
    // funnel's own order. Cold Call remains what the hired roles land on: their
    // home URLs carry ?tab=cold-call explicitly, so the default only moves for
    // an owner typing the bare pillar URL.
    tabs: [
      { id: "leads", label: "Leads", ready: true },
      { id: "cold-call", label: "Cold Call", ready: true },
      { id: "sms", label: "SMS", ready: true },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    // Two pages (Jake, 2026-08-23): Pipeline first, then Data.
    //
    // Pipeline is the board outcomes land on, read live and read only. Data is
    // the month in aggregate, also read only. Both are rail rows now (the rail
    // carries every page inline), so the labels are short enough to scan there:
    // "Pipeline" and "Data", not "Sales Pipeline" and "Sales Data", because the
    // pillar name would be said twice in every row.
    //
    // Sales Calls was a tab here and is gone. The meetings are still counted,
    // unchanged, by lib/salesCalls.ts: Data reads the same reconciliation the
    // calls page used to, so removing the page removed no numbers. An old
    // ?tab=calls or ?tab=on-call link falls through resolvePillarTab and lands
    // on Pipeline.
    //
    // Playbook is gone from the nav too. The words live on
    // (functions/lib/salesPlaybook.ts) and the call cockpit still reads them;
    // only the editing page is out of the chrome.
    //
    // A Cold Call Data tab used to sit here as a "channel" page. It is gone:
    // that month lives on Acquisition > Cold Call > Tracker with the caller
    // selector on "Agency".
    tabs: [
      { id: "pipeline", label: "Pipeline", ready: true },
      { id: "sales-data", label: "Data", ready: true },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    // Operations is no longer a rail group (Jake, 2026-08-23). It stays here as
    // the ROUTE that hosts these three pages, because each one is a tab body on
    // /admin/pillar/operations and none has a standalone route of its own. The
    // rail promotes all three to top-level rows instead, so the pillar is gone
    // from the chrome without moving a single page.
    //
    // Business Health, Calculator, Time Audit and SOPs came out of the nav in
    // the same pass. Their tab bodies and components are deliberately LEFT in
    // PillarPage: nothing renders them now, and putting a row back here is the
    // whole of restoring one.
    //
    // Tasks leads, then Inbox (Hauck Marketing's own GoHighLevel sub-account,
    // the one the cold call texts from), then Clients (everyone already
    // running, and what they told us on the intake form). This order is the
    // rail's order, so the tab strip and the rail cannot disagree.
    tabs: [
      { id: "tasks", label: "Tasks", ready: true },
      { id: "inbox", label: "Inbox", ready: true },
      { id: "clients", label: "Clients", ready: true },
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
