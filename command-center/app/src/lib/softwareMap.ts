import { NAV, flattenNav, isNavSection, type NavEntry, type NavItem } from "./nav";
import {
  PAID_ADS_TABS,
  REVIEWS_TABS,
  WEBSITE_TABS,
  REACTIVATION_TABS,
  LEADS_TABS,
  type PageTab,
} from "./pageTabs";

// The inventory behind the admin Fulfillment "Software" tab: every page of the
// client app, grouped and labelled, for one client.
//
// This list DERIVES itself. nav.ts already defines every sidebar row (grouped
// into Marketing and Company) and pageTabs.ts already defines every in-page tab,
// because both are the real sources of truth the running app renders from. A
// hand-maintained inventory would be wrong within a week; this one cannot drift,
// because adding a page to the app is what adds it here.
//
// Only two things are declared by hand:
//   - JOBS_VIEWS, because the Jobs calendar views are component state, not routes
//   - RECORD_PAGES, because a record page needs a real record id to point at
//
// softwareMap.test.ts asserts every entry resolves to a route registered in
// App.tsx, so a rename in one place cannot silently rot this list.

export interface SoftwarePage {
  // Stable id, used as the selection key.
  id: string;
  // What this surface is called, in the client's own words.
  label: string;
  // Path in the client app, e.g. "/marketing/paid-ads/media".
  path: string;
  // A tab or view living inside a parent page, indented under it in the rail.
  child?: boolean;
  // Record pages need a real id substituted before they can be previewed.
  needsRecord?: RecordKind;
}

export interface SoftwareGroup {
  id: string;
  label: string;
  pages: SoftwarePage[];
}

export type RecordKind = "lead" | "contact" | "customer" | "conversation";

// Which in-page tab bar belongs to which sidebar row. Keyed by the sidebar
// row's path so the pairing survives a label change on either side.
const TABS_BY_PARENT: Record<string, PageTab[]> = {
  "/marketing/paid-ads": PAID_ADS_TABS,
  "/marketing/website": WEBSITE_TABS,
  "/marketing/reviews": REVIEWS_TABS,
  "/marketing/reactivation": REACTIVATION_TABS,
  "/sales/leads": LEADS_TABS,
};

// The Sales page's Schedule tab hosts a Jobs/Month/Week/Agenda switcher whose
// state is local, so these are not routes in App.tsx. Sales reads ?tab= and
// Jobs.tsx reads ?view=, so a view is linked as /sales?tab=schedule&view=<id>.
const JOBS_VIEWS: { id: string; label: string }[] = [
  { id: "jobs", label: "Jobs" },
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "agenda", label: "Agenda" },
];

// Pages that render one record. The path carries a :placeholder that
// resolveRecordPaths swaps for a real id from the client's own data.
const RECORD_PAGES: SoftwarePage[] = [
  { id: "record-lead", label: "A single lead", path: "/lead/:id", needsRecord: "lead" },
  {
    id: "record-contact",
    label: "A single contact",
    path: "/contacts/:contactId",
    needsRecord: "contact",
  },
  {
    id: "record-customer",
    label: "A single customer",
    path: "/customers/:contactId",
    needsRecord: "customer",
  },
  {
    id: "record-conversation",
    label: "A single conversation",
    path: "/conversations/:contactId",
    needsRecord: "conversation",
  },
];

function pageFor(item: NavItem): SoftwarePage {
  return { id: item.to, label: item.label, path: item.to };
}

// Expand one sidebar row into itself plus any tabs or views it hosts. A tab
// whose path equals its parent's is the parent's own default view, so it is
// skipped rather than listed twice.
function expand(item: NavItem): SoftwarePage[] {
  const out: SoftwarePage[] = [pageFor(item)];

  const tabs = TABS_BY_PARENT[item.to];
  if (tabs) {
    for (const tab of tabs) {
      if (tab.to === item.to) continue;
      out.push({ id: tab.to, label: tab.label, path: tab.to, child: true });
    }
  }

  if (item.to === "/sales") {
    for (const view of JOBS_VIEWS) {
      out.push({
        id: `/sales?tab=schedule&view=${view.id}`,
        label: view.label,
        path: `/sales?tab=schedule&view=${view.id}`,
        child: true,
      });
    }
  }

  return out;
}

// The full grouped inventory. Sidebar sections become groups; standalone rows
// (Home, Chat) are gathered into a leading "Main" group so nothing floats
// ungrouped. Record pages are a trailing group of their own.
export function buildSoftwareMap(entries: NavEntry[] = NAV): SoftwareGroup[] {
  const groups: SoftwareGroup[] = [];
  const standalone: SoftwarePage[] = [];

  for (const entry of entries) {
    if (isNavSection(entry)) {
      groups.push({
        id: entry.id,
        label: entry.label,
        pages: entry.items.flatMap(expand),
      });
    } else {
      standalone.push(...expand(entry));
    }
  }

  return [
    ...(standalone.length ? [{ id: "main", label: "Main", pages: standalone }] : []),
    ...groups,
    { id: "records", label: "Record pages", pages: RECORD_PAGES },
  ];
}

// Every page in the map, flattened. Used for counts and for the test that
// checks each path against the router.
export function allSoftwarePages(groups: SoftwareGroup[] = buildSoftwareMap()): SoftwarePage[] {
  return groups.flatMap((g) => g.pages);
}

// Substitute real record ids into the record-page paths. A kind with no
// available record yields a null path, which the rail renders as a disabled row
// saying so, rather than framing a page that would only 404.
export function resolveRecordPath(
  page: SoftwarePage,
  ids: Partial<Record<RecordKind, string | null>>,
): string | null {
  if (!page.needsRecord) return page.path;
  const id = ids[page.needsRecord];
  if (!id) return null;
  return page.path.replace(/:[A-Za-z]+$/, encodeURIComponent(id));
}

// Sanity helper for the test: every sidebar row reachable from NAV.
export function navPaths(entries: NavEntry[] = NAV): string[] {
  return flattenNav(entries).map((i) => i.to);
}
