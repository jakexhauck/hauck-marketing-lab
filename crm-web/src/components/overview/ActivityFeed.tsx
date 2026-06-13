import type { ComponentType } from "react";
import {
  Activity as ActivityIcon,
  UserPlus,
  MessageSquare,
  CalendarClock,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  DollarSign,
} from "lucide-react";
import { Panel, PanelHeader, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";
import type { ApiActivity } from "@hauck/core";
import type { Tone } from "@/lib/status";

const MAX_ROWS = 8;

// Map a raw webhook action to an icon + tone. Falls through to a neutral pulse.
function metaFor(action: string): { Icon: ComponentType<{ size?: number }>; tone: Tone } {
  const a = action.toLowerCase();
  if (a.includes("won") || a.includes("paid") || a.includes("succeed"))
    return { Icon: CheckCircle2, tone: "positive" };
  if (a.includes("lost") || a.includes("fail") || a.includes("cancel"))
    return { Icon: XCircle, tone: "danger" };
  if (a.includes("payment") || a.includes("invoice") || a.includes("transaction"))
    return { Icon: DollarSign, tone: "warning" };
  if (a.includes("message") || a.includes("conversation") || a.includes("inbound") || a.includes("reply"))
    return { Icon: MessageSquare, tone: "brand" };
  if (a.includes("appointment") || a.includes("calendar") || a.includes("booking"))
    return { Icon: CalendarClock, tone: "brand" };
  if (a.includes("stage") || a.includes("move") || a.includes("pipeline"))
    return { Icon: ArrowRightLeft, tone: "neutral" };
  if (a.includes("lead") || a.includes("contact") || a.includes("opportunity"))
    return { Icon: UserPlus, tone: "brand" };
  return { Icon: ActivityIcon, tone: "neutral" };
}

const ICON_WRAP: Record<Tone, string> = {
  neutral: "bg-surface-2 text-faint",
  brand: "bg-brand-tint text-brand-text",
  positive: "bg-positive-tint text-positive",
  warning: "bg-warning-tint text-warning",
  danger: "bg-danger-tint text-danger",
};

const humanize = (action: string) =>
  action.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function ActivityFeed({
  activity,
  isLoading,
  isError,
  onRetry,
}: {
  activity: ApiActivity[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const rows = (activity ?? []).slice(0, MAX_ROWS);

  return (
    <Panel className="flex min-h-0 flex-col overflow-hidden">
      <PanelHeader kicker="Live" title="Recent activity" />
      {isLoading ? (
        <ul className="divide-y divide-divider">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-12" />
            </li>
          ))}
        </ul>
      ) : isError ? (
        <ErrorState description="Activity failed to load." onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ActivityIcon size={22} />}
          title="No activity yet"
          description="New leads, messages, and bookings will stream in here."
        />
      ) : (
        <ul className="divide-y divide-divider">
          {rows.map((ev) => {
            const { Icon, tone } = metaFor(ev.action);
            const text = ev.payload?.summary?.trim() || humanize(ev.action);
            return (
              <li key={ev.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    ICON_WRAP[tone],
                  )}
                >
                  <Icon size={15} />
                </span>
                <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-text">{text}</p>
                <span className="shrink-0 whitespace-nowrap font-data text-[11px] text-faint tnum">
                  {relativeTime(ev.created_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
