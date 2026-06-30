import {
  Home,
  GitBranch,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  Users,
  CalendarDays,
  Receipt,
  Activity,
  UserCog,
  Inbox,
  LayoutDashboard,
  Workflow,
  ScrollText,
  BarChart3,
  Star,
  Mail,
  Globe,
  Share2,
  Images,
  UserPlus,
  FolderOpen,
  TrendingUp,
  Building2,
  Contact,
  Sparkles,
  LayoutGrid,
  MousePointerClick,
  Send,
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
  // Sub-pages that live one level below this item in the desktop sidebar. When
  // present, the item renders as an expandable row inside its section's lower
  // zone: clicking it opens the group and lands on this item's own route (the
  // overview), and the children appear indented beneath it. Used by Social
  // Media, whose overview/ideas/calendar/posts/insights all live under
  // /marketing/social. One level only — children never nest further.
  children?: NavItem[];
}

// A static (non-collapsible) section in the desktop sidebar that groups related
// surfaces under an inline header (e.g. Sales). Sections are a sidebar-only
// concept: the phone bottom bar reads the flattened item list, so grouping
// never changes the bottom bar.
export interface NavSection {
  id: string;
  label: string;
  // Shown on the section's top-level button in the desktop sidebar. Clicking the
  // button reveals this section's items in the lower zone and jumps to its first
  // real (non-coming-soon) page.
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
export const NAV: NavEntry[] = [
  { to: "/home", label: "Home", icon: Home, capability: "overview", bottomNav: true },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    items: [
      {
        to: "/marketing/paid-ads",
        label: "Paid Ads",
        shortLabel: "Ads",
        icon: Megaphone,
        children: [
          { to: "/marketing/paid-ads", label: "Overview", icon: LayoutDashboard },
          { to: "/marketing/paid-ads/creatives", label: "Your Ads", shortLabel: "Ads", icon: Images },
          { to: "/marketing/paid-ads/leads", label: "Leads", icon: UserPlus },
          { to: "/marketing/paid-ads/insights", label: "What's working", shortLabel: "Results", icon: BarChart3 },
        ],
      },
      {
        to: "/marketing/reviews",
        label: "Google Reviews",
        shortLabel: "Reviews",
        icon: Star,
        children: [
          { to: "/marketing/reviews", label: "Overview", icon: LayoutDashboard },
          { to: "/marketing/reviews/requests", label: "Ask for Reviews", shortLabel: "Ask", icon: Send },
          { to: "/marketing/reviews/all", label: "All Reviews", shortLabel: "Reviews", icon: MessageSquare },
          { to: "/marketing/reviews/insights", label: "What's working", shortLabel: "Insights", icon: BarChart3 },
        ],
      },
      { to: "/marketing/email", label: "Email Campaigns", shortLabel: "Email", icon: Mail, comingSoon: true },
      {
        to: "/marketing/website",
        label: "Website",
        icon: Globe,
        children: [
          { to: "/marketing/website", label: "Overview", icon: LayoutDashboard },
          { to: "/marketing/website/pages", label: "Pages", icon: LayoutGrid },
          { to: "/marketing/website/request", label: "Request a Change", shortLabel: "Requests", icon: MousePointerClick },
          { to: "/marketing/website/insights", label: "What's working", shortLabel: "Insights", icon: BarChart3 },
        ],
      },
      {
        to: "/marketing/social",
        label: "Social Media",
        shortLabel: "Social",
        icon: Share2,
        children: [
          { to: "/marketing/social", label: "Overview", icon: LayoutDashboard },
          { to: "/marketing/social/ideas", label: "Ideas", icon: Sparkles },
          { to: "/marketing/social/calendar", label: "Calendar", icon: CalendarDays },
          { to: "/marketing/social/posts", label: "My Posts", shortLabel: "Posts", icon: LayoutGrid },
          { to: "/marketing/social/insights", label: "What's working", shortLabel: "Insights", icon: BarChart3 },
        ],
      },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    icon: TrendingUp,
    items: [
      { to: "/sales/overview", label: "Sales Overview", shortLabel: "Overview", icon: LayoutDashboard, comingSoon: true },
      // Inbound from the website: estimate-request forms and chat-widget messages,
      // gathered in one friendly place (kept separate from the Pipeline on
      // purpose). Open to everyone for now.
      { to: "/sales/inquiries", label: "New Inquiries", shortLabel: "Inquiries", icon: Inbox, comingSoon: true },
      { to: "/leads", label: "Pipeline", shortLabel: "Leads", icon: GitBranch, capability: "pipeline", bottomNav: true },
      { to: "/sales/scripts", label: "Sales Scripts", shortLabel: "Scripts", icon: ScrollText, comingSoon: true },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    icon: Users,
    items: [
      { to: "/conversations", label: "Inbox", shortLabel: "Chats", icon: MessageSquare, capability: "inbox", bottomNav: true },
      { to: "/contacts", label: "Contacts", icon: Contact, capability: "contacts", bottomNav: true },
      { to: "/calendar", label: "Calendar", icon: CalendarDays, capability: "calendar" },
      { to: "/activity", label: "Activity", icon: Activity, capability: "activity" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: Building2,
    items: [
      { to: "/billing", label: "Revenue", icon: Receipt, capability: "billing" },
      { to: "/operations/reports", label: "Reports & Analytics", shortLabel: "Reports", icon: BarChart3, comingSoon: true },
      // Built and live (read-only): the follow-up + reactivation engine.
      { to: "/operations/automations", label: "Automations", icon: Workflow },
      { to: "/company/documents", label: "Documents & Resources", shortLabel: "Docs", icon: FolderOpen, comingSoon: true },
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
