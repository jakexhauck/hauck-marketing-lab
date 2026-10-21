import {
  AppWindow,
  Gauge,
  NotebookText,
  Megaphone,
  Telescope,
  Workflow,
  Briefcase,
  MessageSquareText,
  Radio,
  CalendarDays,
  ClipboardList,
  Database,
  Image,
  LayoutDashboard,
  ListChecks,
  PenLine,
  PhoneCall,
  Rocket,
  Plug,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ClientNavRow } from "../../lib/clientNav";

// Icons for a client's sidebar rows, shared by the desktop rail and the phone
// sheet. Keyed by sub-page where there is one, else by page. Presentation only,
// so it lives beside the chrome rather than in lib/clientNav.
const ICONS: Record<string, LucideIcon> = {
  brief: NotebookText,
  dashboard: LayoutDashboard,
  leads: ListChecks,
  "meta-data": Database,
  creatives: Image,
  "copy-angles": PenLine,
  "lead-form": ClipboardList,
  setup: Plug,
  connect: Plug,
  calendars: CalendarDays,
  "follow-ups": MessageSquareText,
  capi: Radio,
  setter: PhoneCall,
  management: Briefcase,
};

// Agent rows are keyed by agent id, kept apart from ICONS because "ghl" and
// "ads" would otherwise collide with page ids.
export const AGENT_ICONS: Record<string, LucideIcon> = {
  manager: Gauge,
  csm: Gauge,
  research: Telescope,
  ads: Megaphone,
  ghl: Workflow,
};

// The Client Brief's sections (lib/clientBrief.ts): an agent's own icon, plus
// the three sections no agent owns.
export const BRIEF_SECTION_ICONS: Record<string, LucideIcon> = {
  ...AGENT_ICONS,
  client: UserRound,
  "onboarding-call": PhoneCall,
  "launch-call": Rocket,
};

export function clientRowIcon(row: ClientNavRow): LucideIcon {
  if (row.page === "agent") return AGENT_ICONS[row.sub ?? ""] ?? Gauge;
  return ICONS[row.sub ?? row.page] ?? ICONS[row.page] ?? AppWindow;
}
