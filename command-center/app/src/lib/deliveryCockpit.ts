// Pure config + helpers for the per-client Fulfillment cockpit
// (/admin/delivery/:tenantId). Kept out of the component so the two-level tab
// model (service tab + sub-tab) and the query-param resolution stay testable
// without React or the router.
//
// Overview and Config are real, working tabs. Every service tab (Paid Ads,
// Web Design, Google Reviews, Reactivation) ships as an honest placeholder
// shell in Phase 1 and is filled in its own later phase, once its endpoint
// accepts an admin-supplied tenantId.

export type ServiceTab =
  | "overview"
  | "paid-ads"
  | "web-design"
  | "google-reviews"
  | "reactivation"
  | "config";

export interface SubTabDef {
  id: string;
  label: string;
  // false = an honest "coming in the next phase" placeholder.
  ready: boolean;
}

export interface ServiceTabDef {
  id: ServiceTab;
  label: string;
  ready: boolean;
  // Omitted for tabs that have no second level (Overview, Config).
  subTabs?: SubTabDef[];
}

// Phase 1 ships every sub-tab as ready:false. Later phases flip them on.
export const SERVICE_TABS: ServiceTabDef[] = [
  { id: "overview", label: "Overview", ready: true },
  {
    id: "paid-ads",
    label: "Paid Ads",
    ready: false,
    subTabs: [
      { id: "campaigns", label: "Campaigns", ready: false },
      { id: "ad-library", label: "Ad Library", ready: false },
      { id: "funnel", label: "Funnel", ready: false },
      { id: "data-leads", label: "Data & Leads", ready: false },
    ],
  },
  {
    id: "web-design",
    label: "Web Design",
    ready: true,
    subTabs: [
      { id: "site", label: "Site", ready: true },
      { id: "pages", label: "Pages", ready: true },
      { id: "change-requests", label: "Change Requests", ready: true },
      { id: "analytics", label: "Analytics", ready: true },
    ],
  },
  {
    id: "google-reviews",
    label: "Google Reviews",
    ready: false,
    subTabs: [
      { id: "funnel", label: "Funnel", ready: false },
      { id: "all-reviews", label: "All Reviews", ready: false },
      { id: "requests", label: "Requests", ready: false },
      { id: "reputation-report", label: "Reputation Report", ready: false },
    ],
  },
  {
    id: "reactivation",
    label: "Reactivation",
    ready: false,
    subTabs: [
      { id: "campaign", label: "Campaign", ready: false },
      { id: "results", label: "Results", ready: false },
    ],
  },
  { id: "config", label: "Config", ready: true },
];

// Overview is real, so it is the default landing tab.
export const DEFAULT_SERVICE_TAB: ServiceTab = "overview";

const VALID_SERVICE = new Set<string>(SERVICE_TABS.map((t) => t.id));

// Resolve a raw ?tab= value to a known service tab, else the default.
export function resolveServiceTab(param: string | null | undefined): ServiceTab {
  if (param && VALID_SERVICE.has(param)) return param as ServiceTab;
  return DEFAULT_SERVICE_TAB;
}

// The sub-tabs for a service tab, or [] when it has none.
export function subTabsFor(tab: ServiceTab): SubTabDef[] {
  return SERVICE_TABS.find((t) => t.id === tab)?.subTabs ?? [];
}

// Resolve a raw ?sub= value against the active service tab. Returns the first
// sub-tab id when the given one is invalid, or null when the service has none.
export function resolveSubTab(
  tab: ServiceTab,
  param: string | null | undefined,
): string | null {
  const subs = subTabsFor(tab);
  if (subs.length === 0) return null;
  if (param && subs.some((s) => s.id === param)) return param;
  return subs[0].id;
}

// The "coming soon" copy for a not-yet-built surface.
export function placeholderCopy(label: string): string {
  return `${label} is coming in a later phase.`;
}
