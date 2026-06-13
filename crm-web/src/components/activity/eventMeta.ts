import {
  Banknote,
  Trophy,
  XCircle,
  AlertTriangle,
  UserPlus,
  CalendarClock,
  MessageSquare,
  FileText,
  Activity as ActivityIcon,
  type LucideIcon,
} from "lucide-react";
import type { Tone } from "@/lib/status";

// One place that derives a visual identity (tone + icon + readable label) from a
// raw backend action string. The webhook is the single writer of these actions,
// but the vocabulary is open, so we match on substrings rather than an exact map
// and fall back to a neutral, humanized label for anything unrecognized.
export interface EventMeta {
  tone: Tone;
  Icon: LucideIcon;
}

// Humanize an action like "opportunity_won" or "invoice.paid" into "Opportunity
// won". Used as the primary text fallback when a payload has no summary.
export function humanizeAction(action: string): string {
  const words = action
    .replace(/[._-]+/g, " ")
    .trim()
    .toLowerCase();
  if (!words) return "Activity";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function eventMeta(action: string): EventMeta {
  const a = (action ?? "").toLowerCase();

  if (a.includes("won") || a.includes("paid") || a.includes("succeed")) {
    return { tone: "positive", Icon: a.includes("won") ? Trophy : Banknote };
  }
  if (a.includes("lost") || a.includes("fail") || a.includes("declin")) {
    return { tone: "danger", Icon: XCircle };
  }
  if (a.includes("overdue") || a.includes("cancel") || a.includes("noshow") || a.includes("no-show")) {
    return { tone: "warning", Icon: AlertTriangle };
  }
  if (a.includes("new") || a.includes("created") || a.includes("lead") || a.includes("opportunity")) {
    return { tone: "brand", Icon: UserPlus };
  }
  if (a.includes("appoint") || a.includes("book") || a.includes("calendar") || a.includes("event")) {
    return { tone: "brand", Icon: CalendarClock };
  }
  if (a.includes("message") || a.includes("sms") || a.includes("email") || a.includes("reply") || a.includes("inbound") || a.includes("outbound")) {
    return { tone: "neutral", Icon: MessageSquare };
  }
  if (a.includes("invoice") || a.includes("note") || a.includes("task") || a.includes("form")) {
    return { tone: "neutral", Icon: FileText };
  }
  return { tone: "neutral", Icon: ActivityIcon };
}
