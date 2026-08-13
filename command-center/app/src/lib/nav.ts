import {
  Megaphone,
  MessageSquare,
  UserCog,
  Contact,
  LayoutGrid,
  Handshake,
  CalendarDays,
  ClipboardList,
  Database,
  FolderOpen,
  Globe,
  type LucideIcon,
} from "lucide-react";
import type { Capability } from "./capabilities";

// Data-driven surfaces: see NavItem.dataGate.
export type DataGate = "organic";

// What the nav needs to know to decide which rows exist. `can` is permissions,
// `hasData` is the client's own setup. Both default to hiding rather than
// showing, so a slow answer never leaks a surface the client should not have.
export interface NavGateOpts {
  isOwner: boolean;
  can: (c: Capability, a?: "view" | "edit") => boolean;
  hasData?: (gate: DataGate) => boolean;
}

export interface NavItem {
  to: string;
  // Full label used in the desktop sidebar.
  label: string;
  // Shorter label for the phone bottom bar (defaults to label when omitted).
  shortLabel?: string;
  icon: LucideIcon;
  // The surface this item opens. A staff member sees it only if they have view
  // access to this capability; owners see everything. Omitted for owner-only
  // admin surfaces (see ownerOnly) and for placeholder pages open to everyone.
  capability?: Capability;
  // Owner-only surfaces (e.g. Team management). Hidden from staff entirely.
  ownerOnly?: boolean;
  // A surface that only exists for SOME clients, decided by their data rather
  // than by their permissions. `capability` answers "is this person allowed to
  // see it"; this answers "does this client have one at all".
  //
  // Organic is the first: the page reads a GHL pipeline named "Organic", which
  // only exists for a client whose website we manage. Rather than a per-client
  // toggle somebody has to remember to flip, the row appears when the pipeline
  // does. Gates default to FALSE while unknown, so a row never flashes in and
  // then disappears on load.
  dataGate?: DataGate;
  // This item's slot in the phone bottom tab bar, 1-based left to right. Absent
  // means it is not in the bar at all; the bar holds the day-to-day surfaces and
  // everything else lives in the desktop sidebar and the /apps grid.
  //
  // An explicit slot rather than a boolean, because the bar used to render in
  // nav-list order, which quietly coupled two unrelated things: where a row sits
  // in the SIDEBAR and where its tab sits on the PHONE. Putting Ads Dashboard
  // beside Lead Tracker in the rail (where it belongs) would have shoved the
  // raised "All" FAB off centre, and nothing in the code said so. Now the bar
  // order is stated here and the sidebar can be reordered freely.
  bottomNav?: number;
  // A skeleton surface that renders the shared "coming soon" screen. Purely
  // informational here (the route decides what to render); kept so the sidebar
  // and docs share one source of truth for what is still stubbed.
  comingSoon?: boolean;
  // Keep this item out of the desktop sidebar while still letting it appear on
  // the phone bottom bar. Used by the agency chat, which on desktop lives in a
  // top-right icon instead of a sidebar row.
  sidebarHidden?: boolean;
  // Sub-pages that live one level below this item in the desktop sidebar. In the
  // simplified IA no sidebar item uses this anymore (channels expose their
  // sub-pages via an in-page <PageTabs> bar instead), but the field stays so
  // flat consumers keep working if a group is ever reintroduced.
  children?: NavItem[];
}

// A static (non-collapsible) section in the desktop sidebar that groups related
// surfaces under an inline header (e.g. Marketing). Sections are a sidebar-only
// concept: the phone bottom bar reads the flattened item list, so grouping
// never changes the bottom bar.
export interface NavSection {
  id: string;
  label: string;
  // Shown on the section's inline header in the desktop sidebar.
  icon: LucideIcon;
  items: NavItem[];
}

export type NavEntry = NavItem | NavSection;

// Where a signed-in client lands, and where every "back to home" control points.
//
// One constant because there are seven of those controls and a sign-in redirect,
// and the last time this moved they did not all move with it: Home was taken out
// of the nav while Login still sent people to it, which quietly undid the change
// for anybody who signed in rather than following a bookmark.
//
// The /home route itself stays registered (App.tsx) so an old bookmark and the
// product tour still resolve. It is simply not somewhere the app sends you.
export const CLIENT_HOME = "/marketing/paid-ads/leads";

export function isNavSection(entry: NavEntry): entry is NavSection {
  return "items" in entry;
}

// Single source of truth for navigation. The desktop sidebar renders this list;
// the phone bottom bar reads the flattened items. Both honour the same
// per-surface permissions the backend enforces, so they can never drift.
//
// One flat list, no section headers: with only Paid Ads left in Marketing the
// old Marketing / Company split was noise. Sections (NavSection) remain
// supported by every consumer, so grouping can come back by wrapping rows again.
// Every channel is a single flat row; its sub-pages live inside the page as a
// <PageTabs> bar, not as sidebar children.
export const NAV: NavEntry[] = [
  // No Home row: retired 2026-08-01. Lead Tracker is the landing page now, and
  // a Home that summarised the pages either side of it was a stop on the way to
  // the page you actually wanted. The /home route stays registered so a bookmark
  // and the product tour still resolve, but no chrome points at it.
  //
  // Paid Ads leads the rail, Lead Tracker first within it: it is the page opened
  // every morning and the one the client app now opens ON. The four stay
  // adjacent rather than Lead Tracker being lifted out on its own, so the
  // section still reads as a section.
  //
  // Creatives sits last: it is the reference page of the group, opened when
  // somebody wants to look at or hand over an ad, not every morning.
  // shortLabel "Tracker": "Lead Tracker" is 11 characters and ran to both edges
  // of its 75px slot in the phone bar, touching its neighbours. The bar's other
  // labels are one short word each ("Ads", "All", "Sales"), so the full name was
  // the odd one out as well as the widest. Sidebar and grid keep the full name.
  { to: "/marketing/paid-ads/leads", label: "Lead Tracker", shortLabel: "Tracker", icon: ClipboardList, bottomNav: 1 },
  { to: "/marketing/paid-ads", label: "Ads Dashboard", shortLabel: "Ads", icon: Megaphone, bottomNav: 2 },
  { to: "/marketing/paid-ads/meta", label: "Meta Data", icon: Database },
  { to: "/marketing/paid-ads/creatives", label: "Creatives", icon: FolderOpen },
  // Organic sits directly under the Paid Ads group because it is the same
  // question asked of the other half of the business: Lead Tracker is what the
  // ads produced, Organic is what the website produced. Only clients whose
  // website we manage have the pipeline behind it, so the row is data-gated.
  { to: "/organic", label: "Organic", icon: Globe, dataGate: "organic" },
  // Sales was one row with two in-page tabs. It is two rows now: the pages are
  // opened independently all day and a tab strip made the second one invisible
  // until you had already arrived at the first.
  //
  // Both still render the same <Sales> component behind /sales/*, so switching
  // between them does not unmount it and a booking begun on Leads survives the
  // jump to Schedule to pick a slot.
  //
  // Only Leads takes a bar slot. The phone bar holds five items with the raised
  // "All" FAB dead centre, so a sixth would push the FAB off centre; Schedule is
  // a desktop job anyway. See the comment on /apps below.
  // shortLabel matches the label: the tab read "Sales" but opened the Leads
  // page, so the bar named a destination the app does not have. Both say Leads
  // now. It sits beside "Tracker" (Lead Tracker) without ambiguity, because
  // that one is the ads lead list and this one is the sales board.
  { to: "/sales", label: "Leads", shortLabel: "Leads", icon: Handshake, bottomNav: 4 },
  { to: "/sales/schedule", label: "Schedule", icon: CalendarDays },
  // Only the services we actively sell get a row. Six channels are
  // back-burnered (hidden here, routes still registered in App.tsx): to
  // re-enable one, add its row back (and re-import its icon):
  //   { to: "/marketing/social", label: "Social Media", shortLabel: "Social", icon: Share2 },
  //   { to: "/marketing/outreach", label: "Commercial Outreach", shortLabel: "Outreach", icon: Send },
  //   { to: "/marketing/groups", label: "Group Outreach", shortLabel: "Groups", icon: Users },
  //   { to: "/marketing/website", label: "Website", icon: Globe },
  //   { to: "/marketing/reviews", label: "Google Reviews", shortLabel: "Reviews", icon: Star },
  //   { to: "/marketing/reactivation", label: "Reactivation", icon: RotateCcw },
  // Phone-only "app grid" launcher, and the raised FAB in the bottom bar. Its
  // bottomNav SLOT is what centres it: the bar sorts by slot, so with five tabs
  // it must be slot 3. The bar reads Leads, Ads, All, Sales, Contacts.
  // Adding or removing a bar tab moves the centre, so re-slot this row when you
  // do; nav.test.ts fails if the FAB stops being the midpoint.
  // Sidebar-hidden (desktop has the full sidebar).
  { to: "/apps", label: "All features", shortLabel: "All", icon: LayoutGrid, bottomNav: 3, sidebarHidden: true },
  // Inbox came off the phone bar 2026-08-02 and Ads Dashboard took its slot: the
  // client opens the app to read ad results, and Chats was the tab nobody
  // pressed. Still on the /apps grid and still in the desktop sidebar, so it
  // costs one tap rather than being hidden. To put the tab back, give this row a
  // bottomNav slot and re-slot the rest so /apps stays the midpoint.
  { to: "/conversations", label: "Inbox", shortLabel: "Chats", icon: MessageSquare, capability: "inbox" },
  // No Leads row: the whole Leads section retired 2026-07-23. The client
  // tracking sheet it hosted was rebuilt tab-for-tab inside Paid Ads (Dashboard
  // / Lead Tracker / Meta Data / Pipeline Stats / How to Use).
  { to: "/contacts", label: "Contacts", icon: Contact, capability: "contacts", bottomNav: 5 },
  // No Customers row: retired from the nav 2026-07-31. The /customers and
  // /customers/:contactId routes stay registered, so a bookmark still resolves
  // and Close Out Job can still send you there after logging a job, but nothing
  // navigates to it from the chrome any more.
  // No Revenue row: customer revenue lives on /customers now, built from real
  // logged jobs instead of the invoices + payments feed (which returns
  // internal_error against live Willis). The /billing route stays registered
  // so an existing bookmark does not 404, but nothing links to it.
  // Team is account administration, not a business surface, so the desktop rail
  // renders it in the footer group beside Settings (matching the admin console)
  // rather than in this list. sidebarHidden rather than deleted: the phone's
  // "All features" grid and global search both read the flat list and still
  // need it.
  { to: "/team", label: "Team", icon: UserCog, ownerOnly: true, sidebarHidden: true },
  // No Chat row: the agency chat left the nav entirely 2026-08-05. It had come
  // off the phone bottom bar on 2026-07-31 and was sidebar-hidden on desktop,
  // which left it reachable from the phone's "All features" grid and NOWHERE on
  // desktop. That asymmetry is the bug: the phone is meant to be a subset of
  // the desktop app, never a superset. The /comms route stays registered in
  // App.tsx so an existing bookmark still resolves.
];

// The phone's "All features" launcher, and the one page it never links to
// (itself). Named because three modules test against them.
export const APPS_ROUTE = "/apps";
// Settings is not a nav row: AllFeatures renders it by hand in its Account
// block. It is still somewhere /apps opens, so it counts as one of its routes.
export const SETTINGS_ROUTE = "/settings";

// A single item's leaf pages: its children when it has them (the parent's own
// route equals its overview child, so the parent itself is not a separate leaf),
// otherwise just the item. Keeps flat consumers (bottom bar, global search) free
// of duplicate routes.
function leafItems(item: NavItem): NavItem[] {
  return item.children?.length ? item.children : [item];
}

// Every leaf nav item, with sections and item children expanded in place. Used
// by the bottom bar and anywhere a flat list of surfaces is needed.
export function flattenNav(entries: NavEntry[]): NavItem[] {
  return entries.flatMap((entry) =>
    isNavSection(entry) ? entry.items.flatMap(leafItems) : leafItems(entry),
  );
}

// The phone bottom bar's tabs, left to right: every item carrying a slot,
// ordered by it. Exported so the bar and its tests read the same ordering rather
// than each re-deriving it (the bar used to sort implicitly, by nav-list order,
// and the tests asserted that order by hand).
export function bottomNavItems(entries: NavEntry[]): NavItem[] {
  return flattenNav(entries)
    .filter((item) => item.bottomNav !== undefined)
    .sort((a, b) => a.bottomNav! - b.bottomNav!);
}

// Every destination the phone's "All features" list can open: the nav's flat
// list, minus /apps itself, plus Settings. Ungated on purpose. This answers
// "can /apps reach this page at all", not "may this person see it"; the list
// AllFeatures renders is permission-filtered before it is grouped, so a page
// somebody cannot open is a page they cannot arrive on either.
//
// Derived rather than hand-listed for the reason appGrid.ts derives its
// catch-all group: a second copy of this list drifts the moment a nav row moves,
// and nothing fails to say so.
export function allFeaturesRoutes(entries: NavEntry[] = NAV): string[] {
  return flattenNav(entries)
    .map((item) => item.to)
    .filter((to) => to !== APPS_ROUTE)
    .concat(SETTINGS_ROUTE);
}

// Does this page need the phone's "back to All features" control?
//
// True for a destination /apps opens that the bottom bar holds NO tab for. On a
// phone those pages are reachable only through the All list, and they used to
// strand you on the way out: Team's back button pointed at /home (retired from
// the nav 2026-08-01, so it was literally the old home page) and Settings' at
// the Lead Tracker. Either way, leaving landed you somewhere you had not been.
//
// False for the five bar tabs, which the bar itself reaches in one tap from
// anywhere: a back chevron on the Lead Tracker, the page the app OPENS on, would
// promise a screen you never came from. False for everything else as well (the
// admin console, the detail screens, an old bookmark like /home), which is why
// this matches the exact path and not a prefix. Detail screens keep their own
// back control, pointing at the list they belong to rather than at /apps.
export function needsBackToAll(pathname: string, entries: NavEntry[] = NAV): boolean {
  if (!allFeaturesRoutes(entries).includes(pathname)) return false;
  return !bottomNavItems(entries).some((item) => item.to === pathname);
}

// Permission gate for a flat list of items: owner-only items need owner;
// capability items need view access; the rest (incl. coming-soon placeholders)
// are always shown. Owners pass every check via can(). Used by the bottom bar
// and inside visibleNav.
export function filterNav(items: NavItem[], opts: NavGateOpts): NavItem[] {
  return items.filter((item) => {
    if (item.ownerOnly && !opts.isOwner) return false;
    // A data gate applies to owners too: an owner whose client has no Organic
    // pipeline has no Organic page to open either. This is not a permission.
    if (item.dataGate && !(opts.hasData?.(item.dataGate) ?? false)) return false;
    if (item.capability) return opts.can(item.capability, "view");
    return true;
  });
}

// The sidebar's view of the nav: standalone items are gated as before (and
// sidebar-hidden ones, e.g. the agency chat, drop out), and each section is
// filtered to its visible items. A section whose items are all hidden drops out
// entirely so the sidebar never shows an empty header.
export function visibleNav(entries: NavEntry[], opts: NavGateOpts): NavEntry[] {
  const out: NavEntry[] = [];
  for (const entry of entries) {
    if (isNavSection(entry)) {
      const items = filterNav(entry.items, opts).filter((i) => !i.sidebarHidden);
      if (items.length) out.push({ ...entry, items });
    } else if (!entry.sidebarHidden && filterNav([entry], opts).length) {
      out.push(entry);
    }
  }
  return out;
}

// Does this row need an EXACT route match to count as active?
//
// react-router's NavLink prefix-matches by default, so a row whose path is the
// start of another row's path stays lit on that other page: with /sales (Leads)
// and /sales/schedule both in the sidebar, opening Schedule highlighted BOTH.
//
// Derived from the list rather than flagged by hand on each row, because the
// pairs that need it are created by adding a row, and a hand-set flag is exactly
// the thing nobody remembers to set. Adding /marketing/paid-ads/meta is what
// makes /marketing/paid-ads need this, and neither line says so.
export function needsExactMatch(item: NavItem, all: readonly NavItem[]): boolean {
  return all.some((other) => other !== item && other.to.startsWith(`${item.to}/`));
}
