// Pure config + helpers for the per-client Service Delivery cockpit
// (/admin/delivery/:tenantId). Kept out of the component so the tab model and
// the query-param resolution are testable without React or the router.
//
// Overview and Config are real, working tabs (Task 3.2 shipped Config; Task
// 3.3 shipped Overview from GET /api/admin/clients/:tenantId). Every other
// tab stays an honest placeholder until its endpoint accepts an
// admin-supplied tenantId (Phase 5): Ads/Leads/Inbox/Calendar/Revenue/Team.

export type CockpitTab =
  | "overview"
  | "ads"
  | "leads"
  | "inbox"
  | "calendar"
  | "revenue"
  | "team"
  | "config";

export interface CockpitTabDef {
  id: CockpitTab;
  label: string;
  // false = an honest "coming in the next phase" placeholder this task.
  ready: boolean;
}

export const COCKPIT_TABS: CockpitTabDef[] = [
  { id: "overview", label: "Overview", ready: true },
  { id: "ads", label: "Paid Ads", ready: false },
  { id: "leads", label: "Leads", ready: false },
  { id: "inbox", label: "Inbox", ready: false },
  { id: "calendar", label: "Calendar", ready: false },
  { id: "revenue", label: "Revenue", ready: false },
  { id: "team", label: "Team", ready: false },
  { id: "config", label: "Config", ready: true },
];

// Overview is real (Task 3.3), so it is the default landing tab.
export const DEFAULT_COCKPIT_TAB: CockpitTab = "overview";

const VALID = new Set<string>(COCKPIT_TABS.map((t) => t.id));

// Resolve a raw ?tab= value to a known tab, falling back to the default. Keeps
// deep links honest: an unknown or missing tab lands on Config, never a blank.
export function resolveCockpitTab(param: string | null | undefined): CockpitTab {
  if (param && VALID.has(param)) return param as CockpitTab;
  return DEFAULT_COCKPIT_TAB;
}

// The "coming soon" copy for a not-yet-built tab, phrased per tab so the empty
// state is honest about what will land there.
export function cockpitPlaceholder(tab: CockpitTabDef): string {
  return `${tab.label} is coming in the next phase.`;
}
