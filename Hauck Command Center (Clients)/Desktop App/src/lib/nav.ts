import {
  LayoutDashboard,
  GitBranch,
  Megaphone,
  MessagesSquare,
  Users,
  CalendarDays,
  Receipt,
  Activity,
  UserCog,
  Building2,
  type LucideIcon,
} from "lucide-react";
import type { Capability, Action } from "@hauck/core";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  // Short hint shown in the command palette.
  hint: string;
  // The surface this item opens. A staff member sees it only if they have view
  // access to this capability; owners see everything. Omitted for owner-only
  // admin surfaces (see ownerOnly).
  capability?: Capability;
  // Owner-only surfaces (e.g. Team management). Hidden from staff entirely.
  ownerOnly?: boolean;
}

// Single source of truth for navigation: the sidebar and command palette both
// read this so they can never drift.
export const NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, hint: "Pulse of the business", capability: "overview" },
  { to: "/paid-ads", label: "Paid Ads", icon: Megaphone, hint: "Spend, leads & ROAS", capability: "paid_ads" },
  { to: "/pipeline", label: "Pipeline", icon: GitBranch, hint: "Leads by stage", capability: "pipeline" },
  { to: "/inbox", label: "Inbox", icon: MessagesSquare, hint: "Conversations", capability: "inbox" },
  { to: "/contacts", label: "Contacts", icon: Users, hint: "Everyone in the book", capability: "contacts" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, hint: "Appointments", capability: "calendar" },
  { to: "/billing", label: "Billing", icon: Receipt, hint: "Invoices & payments", capability: "billing" },
  { to: "/activity", label: "Activity", icon: Activity, hint: "Recent events", capability: "activity" },
  { to: "/team", label: "Team", icon: UserCog, hint: "Staff & permissions", ownerOnly: true },
];

// Filter the nav to what the signed-in user may see: owner-only items need
// owner; capability items need view access; the rest are always shown. Owners
// pass every check via can(). Used by the sidebar and command palette so both
// stay in lockstep with the backend's permission enforcement.
export function filterNav(
  items: NavItem[],
  opts: { isOwner: boolean; can: (c: Capability, a?: Action) => boolean },
): NavItem[] {
  return items.filter((item) => {
    if (item.ownerOnly) return opts.isOwner;
    if (item.capability) return opts.can(item.capability, "view");
    return true;
  });
}

// Super-admin ("control tower") nav. Shown only to a signed admin session, in
// place of the tenant nav. These surfaces are cross-client and never gated by
// per-tenant capabilities.
export const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Clients", icon: Building2, hint: "Every business" },
];

// Deep-link conventions the command palette uses to open detail in-surface.
// Surfaces read these params to open the relevant drawer/detail.
export const deepLink = {
  lead: (id: string) => `/pipeline?lead=${encodeURIComponent(id)}`,
  contact: (id: string) => `/contacts?contact=${encodeURIComponent(id)}`,
  conversation: (contactId: string) => `/inbox?c=${encodeURIComponent(contactId)}`,
};
