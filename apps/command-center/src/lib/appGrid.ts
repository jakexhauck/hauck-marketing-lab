import type { NavItem } from "./nav";

// The phone "All features" grid's grouping, kept out of the component so a test
// can assert the grid's coverage without rendering React.
//
// Why this exists as its own module: the grid used to hold a hardcoded list of
// routes, and two of them (/sales/leads, /sales/jobs) had since become
// redirects rather than nav rows. The lookup silently found nothing, the whole
// "Sell & book" group rendered as an empty section, and four newer pages (Lead
// Tracker, Meta Data, Creatives, Schedule) were never added at all. On a phone
// the grid is the only route to anything outside the five-tab bottom bar, so
// those pages were simply unreachable and nothing failed to say so.
//
// The fix is the OTHER group: anything in the nav that no group claims still
// gets a tile. A new nav row can now be forgotten here and still show up.

// Account administration, which the grid renders in its own Account block
// beside Settings rather than as a feature tile. Mirrors where the desktop
// sidebar puts Team: its footer, not its nav column.
export const ACCOUNT_ROUTES = ["/team"];

// Routes placed by hand, in the order they should read within their group.
// A route listed here that is not in the nav is simply skipped, so pre-placing
// a back-burnered channel is harmless.
const GROUPS: { label: string; routes: string[] }[] = [
  {
    // Product-area headings (Marketing / Sales / Company), matching how the
    // desktop app is organised, rather than the old task-phrased ones ("Get
    // customers", "Sell & book", "Run the business"). Jake's call 2026-08-05:
    // the phone should name things the same way the desktop does.
    label: "Marketing",
    routes: [
      "/marketing/paid-ads/leads",
      "/marketing/paid-ads",
      "/marketing/paid-ads/meta",
      "/marketing/paid-ads/creatives",
      // Website leads sit with the ads leads: same question, other channel. The
      // row is data-gated, so on a client with no Organic pipeline it is simply
      // absent from `visible` and skipped here.
      "/organic",
      // Back-burnered with their nav.ts rows; restore alongside them:
      //   "/marketing/reviews",
      //   "/marketing/website",
      //   "/marketing/reactivation",
    ],
  },
  {
    label: "Sales",
    routes: ["/sales", "/sales/schedule"],
  },
  {
    label: "Company",
    // No /comms: the agency chat came out of the nav entirely (see nav.ts), so
    // the phone grid no longer offers a feature the desktop app does not have.
    routes: ["/conversations", "/contacts"],
  },
];

// The label the catch-all group renders under. Anything the lists above miss
// lands here rather than vanishing.
export const OTHER_LABEL = "More";

export interface AppGridGroup {
  label: string;
  items: NavItem[];
}

// Group the visible nav items into the grid's sections.
//
// Takes the already permission-filtered list, so the grid can never offer a tile
// the app would refuse to open. Empty groups drop out entirely (a staff member
// without the inbox capability must not see an empty "Run the business"
// heading), and the /apps launcher itself is excluded: a tile linking to the
// page you are already on is noise.
export function groupAppTiles(visible: NavItem[]): AppGridGroup[] {
  const byRoute = new Map(visible.map((item) => [item.to, item]));
  const placed = new Set<string>(["/apps", ...ACCOUNT_ROUTES]);

  const groups: AppGridGroup[] = [];
  for (const group of GROUPS) {
    const items: NavItem[] = [];
    for (const route of group.routes) {
      const item = byRoute.get(route);
      if (!item) continue;
      items.push(item);
      placed.add(route);
    }
    if (items.length) groups.push({ label: group.label, items });
  }

  // The catch-all. Nav order, so a new row appears where the sidebar puts it.
  const rest = visible.filter((item) => !placed.has(item.to));
  if (rest.length) groups.push({ label: OTHER_LABEL, items: rest });

  return groups;
}
