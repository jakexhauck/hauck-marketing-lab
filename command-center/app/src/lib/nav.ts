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
  FolderOpen,
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
}

// A static (non-collapsible) section in the desktop sidebar that groups related
// surfaces under an inline header (e.g. Sales). Sections are a sidebar-only
// concept: the phone bottom bar reads the flattened item list, so grouping
// never changes the bottom bar.
export interface NavSection {
  id: string;
  label: string;
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
    id: "sales",
    label: "Sales",
    items: [
      { to: "/sales/overview", label: "Sales Overview", icon: LayoutDashboard, comingSoon: true },
      // Inbound from the website: estimate-request forms and chat-widget messages,
      // gathered in one friendly place (kept separate from the Pipeline on
      // purpose). Open to everyone for now.
      { to: "/sales/inquiries", label: "New Inquiries", shortLabel: "Inquiries", icon: Inbox, comingSoon: true },
      { to: "/leads", label: "Pipeline", shortLabel: "Leads", icon: GitBranch, capability: "pipeline", bottomNav: true },
      { to: "/sales/scripts", label: "Sales Scripts", icon: ScrollText, comingSoon: true },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { to: "/conversations", label: "Inbox", shortLabel: "Chats", icon: MessageSquare, capability: "inbox", bottomNav: true },
      { to: "/contacts", label: "Contacts", icon: Users, capability: "contacts", bottomNav: true },
      { to: "/calendar", label: "Calendar", icon: CalendarDays, capability: "calendar" },
      // Built and live (read-only): the follow-up + reactivation engine.
      { to: "/operations/automations", label: "Automations", icon: Workflow },
      { to: "/operations/reports", label: "Reports & Analytics", shortLabel: "Reports", icon: BarChart3, comingSoon: true },
      { to: "/activity", label: "Activity", icon: Activity, capability: "activity" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    items: [
      { to: "/marketing/paid-ads", label: "Paid Ads", icon: Megaphone, comingSoon: true },
      { to: "/marketing/reviews", label: "Google Reviews", shortLabel: "Reviews", icon: Star },
      { to: "/marketing/email", label: "Email Campaigns", shortLabel: "Email", icon: Mail, comingSoon: true },
      { to: "/marketing/website", label: "Website", icon: Globe, comingSoon: true },
      { to: "/marketing/social", label: "Social Media", shortLabel: "Social", icon: Share2, comingSoon: true },
    ],
  },
  {
    id: "company",
    label: "Company",
    items: [
      { to: "/billing", label: "Billing", icon: Receipt, capability: "billing" },
      { to: "/company/documents", label: "Documents & Resources", shortLabel: "Docs", icon: FolderOpen, comingSoon: true },
      { to: "/team", label: "Team", icon: UserCog, ownerOnly: true },
    ],
  },
  // The agency chat: a phone bottom-bar tab only. On desktop it lives in the
  // top-right ChatLauncher icon, so it is hidden from the sidebar.
  { to: "/comms", label: "Chat", shortLabel: "Chat", icon: MessagesSquare, bottomNav: true, sidebarHidden: true },
];

// Every leaf nav item, with sections expanded in place. Used by the bottom bar
// and anywhere a flat list of surfaces is needed.
export function flattenNav(entries: NavEntry[]): NavItem[] {
  return entries.flatMap((entry) => (isNavSection(entry) ? entry.items : [entry]));
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
