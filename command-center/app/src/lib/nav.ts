import {
  Home,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  CalendarDays,
  CalendarCheck,
  Receipt,
  UserCog,
  Star,
  Globe,
  FolderOpen,
  Building2,
  Contact,
  Split,
  LayoutGrid,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import type { Capability } from "./capabilities";

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
  // Whether this item shows in the phone bottom tab bar. The bar holds the
  // day-to-day surfaces; everything else lives in the desktop sidebar only.
  bottomNav?: boolean;
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

export function isNavSection(entry: NavEntry): entry is NavSection {
  return "items" in entry;
}

// Single source of truth for navigation. The desktop sidebar renders this list
// (sections become inline-headed groups); the phone bottom bar reads the
// flattened items. Both honour the same per-surface permissions the backend
// enforces, so they can never drift.
//
// Two sections only: Marketing (the agency engine) and Company (the day-to-day
// business), with Home standalone on top and the agency Chat as a phone-only
// tab. Every Marketing channel is a single flat row; its sub-pages live inside
// the page as a <PageTabs> bar, not as sidebar children.
export const NAV: NavEntry[] = [
  { to: "/home", label: "Home", shortLabel: "Today", icon: Home, capability: "overview", bottomNav: true },
  // Marketing shows only the four services we sell. Three channels are
  // back-burnered (hidden here, routes still registered in App.tsx): to
  // re-enable one, add its row back:
  //   { to: "/marketing/social", label: "Social Media", shortLabel: "Social", icon: Share2 },
  //   { to: "/marketing/outreach", label: "Commercial Outreach", shortLabel: "Outreach", icon: Send },
  //   { to: "/marketing/groups", label: "Group Outreach", shortLabel: "Groups", icon: Users },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    items: [
      { to: "/marketing/paid-ads", label: "Paid Ads", shortLabel: "Ads", icon: Megaphone },
      { to: "/marketing/website", label: "Website", icon: Globe },
      { to: "/marketing/reviews", label: "Google Reviews", shortLabel: "Reviews", icon: Star },
      { to: "/marketing/reactivation", label: "Reactivation", icon: RotateCcw },
    ],
  },
  {
    id: "company",
    label: "Company",
    icon: Building2,
    items: [
      { to: "/conversations/sms", label: "Inbox", shortLabel: "Chats", icon: MessageSquare, capability: "inbox", bottomNav: true },
      // Phone-only "app grid" launcher. Sidebar-hidden (desktop has the full
      // sidebar), and placed here so the bottom-bar flatten order centres it:
      // Today, Inbox, All, Contacts, Chat.
      { to: "/apps", label: "All features", shortLabel: "All", icon: LayoutGrid, bottomNav: true, sidebarHidden: true },
      // The one Leads surface. Its page hosts a New Leads / Pipeline tab bar, so
      // the old standalone "Sales Overview" is a tab here, not a sidebar row.
      // On phone it lives in the All-features grid, not the bottom bar.
      { to: "/sales/leads", label: "Leads", shortLabel: "Leads", icon: Split },
      { to: "/contacts", label: "Contacts", icon: Contact, capability: "contacts", bottomNav: true },
      { to: "/sales/jobs", label: "Jobs", shortLabel: "Jobs", icon: CalendarCheck },
      { to: "/calendar", label: "Calendar", icon: CalendarDays, capability: "calendar" },
      { to: "/billing", label: "Revenue", icon: Receipt, capability: "billing" },
      { to: "/company/documents", label: "Assets", icon: FolderOpen },
      { to: "/team", label: "Team", icon: UserCog, ownerOnly: true },
    ],
  },
  // The agency chat: a phone bottom-bar tab only. On desktop it lives in the
  // top-right ChatLauncher icon, so it is hidden from the sidebar.
  { to: "/comms", label: "Chat", shortLabel: "Chat", icon: MessagesSquare, bottomNav: true, sidebarHidden: true },
];

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

// Permission gate for a flat list of items: owner-only items need owner;
// capability items need view access; the rest (incl. coming-soon placeholders)
// are always shown. Owners pass every check via can(). Used by the bottom bar
// and inside visibleNav.
export function filterNav(
  items: NavItem[],
  opts: { isOwner: boolean; can: (c: Capability, a?: "view" | "edit") => boolean },
): NavItem[] {
  return items.filter((item) => {
    if (item.ownerOnly) return opts.isOwner;
    if (item.capability) return opts.can(item.capability, "view");
    return true;
  });
}

// The sidebar's view of the nav: standalone items are gated as before (and
// sidebar-hidden ones, e.g. the agency chat, drop out), and each section is
// filtered to its visible items. A section whose items are all hidden drops out
// entirely so the sidebar never shows an empty header.
export function visibleNav(
  entries: NavEntry[],
  opts: { isOwner: boolean; can: (c: Capability, a?: "view" | "edit") => boolean },
): NavEntry[] {
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
