// Pure config + helpers for the per-client service pages. Since the client
// strip (2026-10-05) these render inside a client's sub-account
// (lib/clientNav.ts owns the rows and addresses); this file keeps the services,
// their sub-pages and the connect gates. Historical notes below describe the
// Fulfillment pages that came first.
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
    // Copy & Angles and Lead Form sit last on purpose. They are not client
    // pages rendered for an operator, they are the operator's own workbench:
    // where the angles, copy, headlines and Instant Forms get written before
    // anything is launched. The client has no route to either. They were one
    // Ad Builder page with an inner switch until 2026-10-06 (Jake), when each
    // became its own page and the Ads view was dropped.
    subTabs: [
      { id: "dashboard", label: "Dashboard", ready: true },
      { id: "leads", label: "Lead Tracker", ready: true },
      { id: "meta-data", label: "Meta Data", ready: true },
      { id: "creatives", label: "Creatives", ready: true },
      { id: "copy-angles", label: "Copy & Angles", ready: true },
      { id: "lead-form", label: "Lead Form", ready: true },
    ],
  },
  // GHL is the operator's workbench for everything that gets pasted INTO the
  // client's GoHighLevel account. It sits beside Paid Ads rather than inside
  // it because the assets it builds are worked whether or not ads are the
  // source of the lead.
  //
  // Two sub-tabs. Conversion Assets builds things a client's leads will read;
  // Calendars decides which of their booking calendars their own diary
  // protects. The wiring underneath is not a tab: it is the Connect screen, and
  // it is only on offer while there is something to connect.
  {
    id: "ghl",
    label: "GHL",
    ready: true,
    // Follow-up Texts, Custom Values and CAPI came from the Client Setup SOP
    // (2026-10-06): the texts, values and keys that used to be typed into GHL
    // by hand from a Google Doc.
    subTabs: [
      { id: "conversion-assets", label: "Conversion Assets", ready: true },
      { id: "follow-ups", label: "Follow-up Texts", ready: true },
      { id: "custom-values", label: "Custom Values", ready: true },
      { id: "capi", label: "CAPI", ready: true },
      { id: "calendars", label: "Calendars", ready: true },
    ],
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

// The sub-tabs for a page, or [] when it has none.
export function subTabsFor(page: string | null | undefined): SubTabDef[] {
  return (page ? BY_ID.get(page)?.subTabs : undefined) ?? [];
}

// The setup step a client lands on while their ads are not wired.
export const ADS_SETUP_SUB = "setup";

// Paid Ads before the ad account is linked.
//
// Dashboard, Lead Tracker and Meta Data all read Meta through the client's own
// ad account. Without one they are three pages of zeroes that look like a quiet
// month rather than an unfinished setup, so they are not offered at all until
// the account exists. What survives is the work that does not need Meta:
// Creatives (whose files live in Drive), Copy & Angles and Lead Form (where the
// ads get written in the first place). Ahead of both sits the wizard that links the account,
// which is where the page opens.
export const ADS_WITHOUT_META = new Set(["creatives", "copy-angles", "lead-form"]);

export function paidAdsSubTabs(subs: SubTabDef[], adsLinked: boolean): SubTabDef[] {
  if (adsLinked) return subs;
  const kept = subs.filter((s) => ADS_WITHOUT_META.has(s.id));
  return [{ id: ADS_SETUP_SUB, label: "Connect ads", ready: true }, ...kept];
}

// The setup step a client lands on while their GoHighLevel sub-account is not
// wired.
export const GHL_SETUP_SUB = "connect";

// GHL before the sub-account is wired.
//
// Same rule as Paid Ads. Calendars reads the client's own GHL calendars:
// without credentials it is an empty screen that looks like a quiet account
// rather than an unfinished setup. Conversion Assets survives, because what it
// builds is written here and pasted in later, so it needs nothing from GHL at
// all.
//
// Once the pair is stored the Connect screen goes too. A wired client has
// nothing to connect, so the row is Conversion Assets and Calendars and no
// wiring screen at all.
export function ghlSubTabs(subs: SubTabDef[], ghlConnected: boolean): SubTabDef[] {
  if (ghlConnected) return subs;
  // Only Calendars needs the sub-account to read. Everything else is written
  // here first (Custom Values shows the app's side and greys out Push).
  const kept = subs.filter((s) => s.id !== "calendars");
  return [{ id: GHL_SETUP_SUB, label: "Connect GHL", ready: true }, ...kept];
}

// The "coming soon" copy for a not-yet-built surface.
export function placeholderCopy(label: string): string {
  return `${label} is coming in a later phase.`;
}
