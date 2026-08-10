// Pure config + helpers for the Fulfillment service pages
// (/admin/fulfillment/:page). Replaces lib/deliveryCockpit.ts, which modelled
// the same eight services as tabs on one per-client page.
//
// The inversion this file encodes: the SERVICE is the page and the CLIENT is a
// control on it. Previously the client was the address (/admin/delivery/:id)
// and the service a ?tab=. Now each service is its own route in the sidebar,
// and the client rides in ?client= (see lib/selectedClient.ts), so switching
// client does not change which page you are on.
//
// Sub-tabs stay a second level INSIDE a page (Paid Ads' Campaigns / Ad Library
// / ...), not sidebar rows: a rail carrying every sub-page is a rail nobody can
// scan.
//
// The list is deliberately short. Overview, Web Design, Google Reviews and
// Reactivation were retired: the first was a summary of pages you can just
// open, and the other three were shells for work we are not delivering. A rail
// row for something that does not exist is a row that lies.

export type FulfillmentPageId = "software" | "paid-ads" | "ghl" | "management";

export interface SubTabDef {
  id: string;
  label: string;
  // false = an honest "coming in a later phase" placeholder.
  ready: boolean;
}

export interface FulfillmentPageDef {
  id: FulfillmentPageId;
  label: string;
  ready: boolean;
  // Omitted for pages with no second level (Overview, Software, Billing, Config).
  subTabs?: SubTabDef[];
}

export const FULFILLMENT_PAGES: FulfillmentPageDef[] = [
  // Software: a read-only inventory of every page of the client app, each one
  // previewable live. No sub-tabs; the page list is its own navigation.
  { id: "software", label: "Software", ready: true },
  {
    id: "paid-ads",
    label: "Paid Ads",
    ready: true,
    // The first four are the client's own Paid Ads pages, rendered for the
    // client in the picker, in the order the client's sidebar lists them.
    // Creatives carries one operator-only control: setting the Drive folder.
    //
    // Ad Builder is the odd one out and sits last on purpose. It is not a
    // client page rendered for an operator, it is the operator's own workbench:
    // where the competitors, angles, copy and headlines get written before
    // anything is launched. The client has no route to it. It holds its own
    // second level (Static / Video / Master) inside the panel rather than
    // adding three more tabs to this row, because four client pages and three
    // private drafting pages side by side would read as seven equal things.
    subTabs: [
      { id: "dashboard", label: "Dashboard", ready: true },
      { id: "leads", label: "Lead Tracker", ready: true },
      { id: "meta-data", label: "Meta Data", ready: true },
      { id: "creatives", label: "Creatives", ready: true },
      { id: "ad-builder", label: "Ad Builder", ready: true },
    ],
  },
  // GHL is the operator's workbench for everything that gets pasted INTO the
  // client's GoHighLevel account. It sits beside Paid Ads rather than inside
  // it because the assets it builds are worked whether or not ads are the
  // source of the lead.
  //
  // One sub-tab today, and it still gets a sub-tab rather than a bare page:
  // the second one (the funnel stubs) is already known, and a page that grows
  // a tab row later moves everything on it the day it does.
  {
    id: "ghl",
    label: "GHL",
    ready: true,
    subTabs: [{ id: "conversion-assets", label: "Conversion Assets", ready: true }],
  },
  // Management is the client's paperwork in one place: the commercial record
  // (was Billing) above the setup that makes their app theirs (was Config).
  // They were split because they were tabs and tabs are cheap; as pages, two
  // rows for one job was one row too many.
  { id: "management", label: "Management", ready: true },
];

// Software is the first service page, so it is where a bare /admin/fulfillment
// and every retired Fulfillment URL lands.
export const DEFAULT_FULFILLMENT_PAGE: FulfillmentPageId = "software";

// The rail order under Fulfillment. Onboarding leads: a client is stood up
// before anything is delivered to them. The Setter Suite sits in the same list
// rather than below a rule, because working a client's leads is the same job as
// the rest of this, even though it (like Onboarding) carries its own client
// list instead of reading the page picker.
export interface FulfillmentNavRow {
  to: string;
  label: string;
}

export const FULFILLMENT_NAV: FulfillmentNavRow[] = [
  { to: "/admin/onboarding", label: "Onboarding" },
  { to: "/admin/fulfillment/software", label: "Software" },
  { to: "/admin/fulfillment/paid-ads", label: "Paid Ads" },
  { to: "/admin/fulfillment/ghl", label: "GHL" },
  { to: "/admin/setter", label: "Setter Suite" },
  { to: "/admin/fulfillment/management", label: "Management" },
];

// Where Fulfillment opens when the pillar row itself is clicked.
export const FULFILLMENT_HOME = FULFILLMENT_NAV[0].to;

// Retired service tabs, mapped to where their work went. Keeps every old
// /admin/delivery/:tenantId?tab= link landing somewhere true rather than on a
// page that no longer exists.
const RETIRED_TABS: Record<string, FulfillmentPageId> = {
  overview: "software",
  "web-design": "software",
  "google-reviews": "software",
  reactivation: "software",
  billing: "management",
  config: "management",
};

// Resolve a raw ?tab= from an old cockpit URL to a page that exists today.
export function legacyFulfillmentPage(tab: string | null | undefined): FulfillmentPageId {
  if (isFulfillmentPage(tab)) return tab;
  return (tab && RETIRED_TABS[tab]) || DEFAULT_FULFILLMENT_PAGE;
}

const BY_ID = new Map<string, FulfillmentPageDef>(
  FULFILLMENT_PAGES.map((p) => [p.id, p]),
);

export function isFulfillmentPage(id: string | null | undefined): id is FulfillmentPageId {
  return !!id && BY_ID.has(id);
}

// The page def for an id, or null when the id is unknown (a typed URL).
export function getFulfillmentPage(
  id: string | null | undefined,
): FulfillmentPageDef | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

// The sub-tabs for a page, or [] when it has none.
export function subTabsFor(page: string | null | undefined): SubTabDef[] {
  return getFulfillmentPage(page)?.subTabs ?? [];
}

// Resolve a raw ?sub= value against a page. Returns the first sub-tab id when
// the given one is invalid, or null when the page has none.
export function resolveSubTab(
  page: string | null | undefined,
  param: string | null | undefined,
): string | null {
  const subs = subTabsFor(page);
  if (subs.length === 0) return null;
  if (param && subs.some((s) => s.id === param)) return param;
  return subs[0].id;
}

// Build a link to a page. Every link into Fulfillment goes through here (the
// sidebar, the redirects, the picker), so the client and sub-tab params can
// never be spelled two different ways.
export function fulfillmentPath(
  page: FulfillmentPageId,
  clientId?: string | null,
  sub?: string | null,
): string {
  const params = new URLSearchParams();
  if (clientId) params.set("client", clientId);
  if (sub) params.set("sub", sub);
  const q = params.toString();
  return `/admin/fulfillment/${page}${q ? `?${q}` : ""}`;
}

// The "coming soon" copy for a not-yet-built surface.
export function placeholderCopy(label: string): string {
  return `${label} is coming in a later phase.`;
}
