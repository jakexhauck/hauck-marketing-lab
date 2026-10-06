import {
  AppWindow,
  Braces,
  Briefcase,
  MessageSquareText,
  Radio,
  CalendarDays,
  Database,
  Image,
  LayoutDashboard,
  ListChecks,
  PenLine,
  PhoneCall,
  Plug,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { ClientNavRow } from "../../lib/clientNav";

// Icons for a client's sidebar rows, shared by the desktop rail and the phone
// sheet. Keyed by sub-page where there is one, else by page. Presentation only,
// so it lives beside the chrome rather than in lib/clientNav.
const ICONS: Record<string, LucideIcon> = {
  onboarding: UserPlus,
  software: AppWindow,
  dashboard: LayoutDashboard,
  leads: ListChecks,
  "meta-data": Database,
  creatives: Image,
  "ad-builder": PenLine,
  setup: Plug,
  connect: Plug,
  "conversion-assets": Sparkles,
  calendars: CalendarDays,
  "follow-ups": MessageSquareText,
  "custom-values": Braces,
  capi: Radio,
  setter: PhoneCall,
  management: Briefcase,
};

export function clientRowIcon(row: ClientNavRow): LucideIcon {
  return ICONS[row.sub ?? row.page] ?? ICONS[row.page] ?? AppWindow;
}
