// The client side of the admin console (/admin/client/:tenantId/...).
//
// Jake, 2026-10-05: the Fulfillment rows left the agency sidebar. Each client
// is now a sub-account, GHL style: a chip on the client strip swaps the whole
// sidebar to that client's pages, and the Agency chip swaps it back. This file
// is the pure model behind that swap, kept out of React so every rule is
// testable: which rows a client gets, what their addresses are, where a gated
// or stale address lands, and where a chip click goes.
//
// The client is in the PATH now, not a remembered ?client= pick. A pasted link
// opens the same client for whoever opens it, and the sidebar can tell which
// view to draw from the address alone.
//
// Paid Ads and GHL keep their connect gates (lib/fulfillmentPages.ts), applied
// to sidebar rows rather than tabs: until a client's ad account is linked their
// Paid Ads group is Connect ads, Creatives and Ad Builder, and GHL likewise.

import {
  ADS_SETUP_SUB,
  GHL_SETUP_SUB,
  ghlSubTabs,
  isFulfillmentPage,
  legacyFulfillmentPage,
  paidAdsSubTabs,
  subTabsFor,
  type SubTabDef,
} from "./fulfillmentPages";

export type ClientPageId = "onboarding" | "software" | "paid-ads" | "ghl" | "setter" | "management";

// What the gates read off a client. AdminClient satisfies it.
export interface ClientGateInfo {
  metaAdAccountId: string | null;
  ghlConnected: boolean;
  onboardingStatus?: "setup" | "live";
}

export interface ClientNavRow {
  page: ClientPageId;
  sub: string | null;
  label: string;
}

export interface ClientNavGroup {
  // A caption above the rows, or null for none.
  caption: string | null;
  // A hairline above the rows instead of a caption.
  rule?: boolean;
  rows: ClientNavRow[];
}

const PAGE_LABELS: Record<ClientPageId, string> = {
  onboarding: "Onboarding",
  software: "Software",
  "paid-ads": "Paid Ads",
  ghl: "GHL",
  setter: "Setter Suite",
  management: "Management",
};

const CLIENT_PAGES = Object.keys(PAGE_LABELS) as ClientPageId[];

export function isClientPage(id: string | null | undefined): id is ClientPageId {
  return !!id && (CLIENT_PAGES as string[]).includes(id);
}

const adsLinked = (c: ClientGateInfo) => Boolean((c.metaAdAccountId ?? "").trim());

// The sub-pages a client is offered on a page, after the gates. [] for a page
// with no second level.
function offeredSubs(c: ClientGateInfo, page: ClientPageId): SubTabDef[] {
  if (page === "paid-ads") return paidAdsSubTabs(subTabsFor("paid-ads"), adsLinked(c));
  if (page === "ghl") return ghlSubTabs(subTabsFor("ghl"), c.ghlConnected);
  return [];
}

const single = (page: ClientPageId): ClientNavRow => ({ page, sub: null, label: PAGE_LABELS[page] });
const subRows = (c: ClientGateInfo, page: ClientPageId): ClientNavRow[] =>
  offeredSubs(c, page).map((s) => ({ page, sub: s.id, label: s.label }));

export function clientNavGroups(c: ClientGateInfo): ClientNavGroup[] {
  return [
    { caption: null, rows: [single("onboarding"), single("software")] },
    { caption: "Paid Ads", rows: subRows(c, "paid-ads") },
    { caption: "GHL", rows: subRows(c, "ghl") },
    { caption: null, rule: true, rows: [single("setter"), single("management")] },
  ];
}

export function clientPath(tenantId: string, page: ClientPageId, sub?: string | null): string {
  const base = `/admin/client/${encodeURIComponent(tenantId)}/${page}`;
  return sub ? `${base}/${encodeURIComponent(sub)}` : base;
}

export interface ParsedClientPath {
  tenantId: string;
  page: string;
  sub: string | null;
}

// Which client and page an address is on, or null outside the client view.
// The page is NOT validated here (that is resolveClientPage's job), so a stale
// address still reads as "inside this client" and the sidebar stays put while
// the page redirects.
export function parseClientPath(pathname: string): ParsedClientPath | null {
  const m = /^\/admin\/client\/([^/]+)\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname);
  if (!m) return null;
  return {
    tenantId: decodeURIComponent(m[1]),
    page: m[2],
    sub: m[3] ? decodeURIComponent(m[3]) : null,
  };
}

// The address a client page should really be on. Null for a page that does not
// exist. A missing, gated or stale sub-page becomes the first one on offer, so
// AAG's Dashboard with no ad account lands on Connect ads.
export function resolveClientPage(
  c: ClientGateInfo,
  page: string,
  sub: string | null,
): { page: ClientPageId; sub: string | null } | null {
  if (!isClientPage(page)) return null;
  const subs = offeredSubs(c, page);
  if (subs.length === 0) return { page, sub: null };
  if (sub && subs.some((s) => s.id === sub)) return { page, sub };
  return { page, sub: subs[0].id };
}

// Where a strip chip goes. From another client: the same page and sub-page,
// falling back inside the group (resolveClientPage). The connect steps are not
// carried across, because a wired client has nothing to connect. From the
// agency: a client still being set up opens on Onboarding, a live one on their
// ads.
export function switchTarget(
  from: { page: string; sub: string | null } | null,
  to: ClientGateInfo & { id: string },
): string {
  if (from && isClientPage(from.page)) {
    const carried = from.sub === ADS_SETUP_SUB || from.sub === GHL_SETUP_SUB ? null : from.sub;
    const r = resolveClientPage(to, from.page, carried);
    if (r) return clientPath(to.id, r.page, r.sub);
  }
  if (to.onboardingStatus === "setup") return clientPath(to.id, "onboarding");
  const ads = resolveClientPage(to, "paid-ads", null);
  return clientPath(to.id, "paid-ads", ads?.sub);
}

// An old Fulfillment / Delivery cockpit page id mapped to its client page.
// Sub-pages are carried as given; ClientPage corrects any that are gated.
export function legacyClientPath(page: string | null, sub: string | null, tenantId: string): string {
  if (page === "onboarding" || page === "setter") return clientPath(tenantId, page);
  const mapped = isFulfillmentPage(page) ? page : legacyFulfillmentPage(page);
  return clientPath(tenantId, mapped, isFulfillmentPage(page) ? sub : null);
}
