// Pure config + helpers for the per-client Service Delivery cockpit
// (/admin/delivery/:tenantId). Kept out of the component so the tab model and
// the query-param resolution are testable without React or the router.
//
// Only "config" ships as a real, working tab this task; every other tab is an
// honest placeholder that later phases fill (Overview/Paid Ads/Leads = Task
// 3.3; Inbox/Calendar/Revenue/Team = Phase 5).

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
  { id: "overview", label: "Overview", ready: false },
  { id: "ads", label: "Paid Ads", ready: false },
  { id: "leads", label: "Leads", ready: false },
  { id: "inbox", label: "Inbox", ready: false },
  { id: "calendar", label: "Calendar", ready: false },
  { id: "revenue", label: "Revenue", ready: false },
  { id: "team", label: "Team", ready: false },
  { id: "config", label: "Config", ready: true },
];

// Config is the only working tab for now, so it is the default landing tab.
// Task 3.3 flips this to Overview once Overview is real.
export const DEFAULT_COCKPIT_TAB: CockpitTab = "config";

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
