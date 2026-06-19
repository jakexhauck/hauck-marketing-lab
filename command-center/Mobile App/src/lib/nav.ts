import {
  Home,
  GitBranch,
  Megaphone,
  MessageSquare,
  Users,
  CalendarDays,
  Receipt,
  Activity,
  UserCog,
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
  // admin surfaces (see ownerOnly).
  capability?: Capability;
  // Owner-only surfaces (e.g. Team management). Hidden from staff entirely.
  ownerOnly?: boolean;
  // Whether this item shows in the phone bottom tab bar. The bar holds the four
  // day-to-day surfaces; everything else lives in the desktop sidebar only.
  bottomNav?: boolean;
}

// Single source of truth for navigation: the desktop sidebar and the phone
// bottom bar both read this so they can never drift, and both honour the same
// per-surface permissions the backend enforces.
export const NAV: NavItem[] = [
  { to: "/home", label: "Home", icon: Home, capability: "overview", bottomNav: true },
  { to: "/leads", label: "Pipeline", shortLabel: "Leads", icon: GitBranch, capability: "pipeline", bottomNav: true },
  { to: "/conversations", label: "Inbox", shortLabel: "Chats", icon: MessageSquare, capability: "inbox", bottomNav: true },
  { to: "/contacts", label: "Contacts", icon: Users, capability: "contacts", bottomNav: true },
  { to: "/paid-ads", label: "Paid Ads", icon: Megaphone, capability: "paid_ads" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, capability: "calendar" },
  { to: "/billing", label: "Billing", icon: Receipt, capability: "billing" },
  { to: "/activity", label: "Activity", icon: Activity, capability: "activity" },
  { to: "/team", label: "Team", icon: UserCog, ownerOnly: true },
];

// Filter the nav to what the signed-in user may see: owner-only items need
// owner; capability items need view access; the rest are always shown. Owners
// pass every check via can(). Used by the sidebar and bottom bar so both stay
// in lockstep with the backend's permission enforcement.
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
