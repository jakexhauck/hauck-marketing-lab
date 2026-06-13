import {
  LayoutDashboard,
  GitBranch,
  MessagesSquare,
  Users,
  CalendarDays,
  Receipt,
  Activity,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  // Short hint shown in the command palette.
  hint: string;
}

// Single source of truth for navigation: the sidebar and command palette both
// read this so they can never drift.
export const NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, hint: "Pulse of the business" },
  { to: "/pipeline", label: "Pipeline", icon: GitBranch, hint: "Leads by stage" },
  { to: "/inbox", label: "Inbox", icon: MessagesSquare, hint: "Conversations" },
  { to: "/contacts", label: "Contacts", icon: Users, hint: "Everyone in the book" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, hint: "Appointments" },
  { to: "/billing", label: "Billing", icon: Receipt, hint: "Invoices & payments" },
  { to: "/activity", label: "Activity", icon: Activity, hint: "Recent events" },
];

// Deep-link conventions the command palette uses to open detail in-surface.
// Surfaces read these params to open the relevant drawer/detail.
export const deepLink = {
  lead: (id: string) => `/pipeline?lead=${encodeURIComponent(id)}`,
  contact: (id: string) => `/contacts?contact=${encodeURIComponent(id)}`,
  conversation: (contactId: string) => `/inbox?c=${encodeURIComponent(contactId)}`,
};
