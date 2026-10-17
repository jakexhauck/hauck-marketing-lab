import {
  AppWindow,
  Clapperboard,
  FileChartColumn,
  Gauge,
  LayoutTemplate,
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
  ListTodo,
  PenLine,
  PhoneCall,
  Plug,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ClientNavRow } from "../../lib/clientNav";

// Icons for a client's sidebar rows, shared by the desktop rail and the phone
// sheet. Keyed by sub-page where there is one, else by page. Presentation only,
// so it lives beside the chrome rather than in lib/clientNav.
const ICONS: Record<string, LucideIcon> = {
  onboarding: ListTodo,
  info: UserRound,
  software: AppWindow,
  dashboard: LayoutDashboard,
  leads: ListChecks,
  "meta-data": Database,
  creatives: Image,
  "copy-angles": PenLine,
  "lead-form": ClipboardList,
  setup: Plug,
  connect: Plug,
  "conversion-assets": Sparkles,
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
  research: Telescope,
  ads: Megaphone,
  creative: Clapperboard,
  landing: LayoutTemplate,
  ghl: Workflow,
  reporting: FileChartColumn,
};

export function clientRowIcon(row: ClientNavRow): LucideIcon {
  if (row.page === "agent") return AGENT_ICONS[row.sub ?? ""] ?? Gauge;
  return ICONS[row.sub ?? row.page] ?? ICONS[row.page] ?? AppWindow;
}
