import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import {
  Panel,
  PanelHeader,
  Avatar,
  StatusPill,
  EmptyState,
  ErrorState,
  Skeleton,
} from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { appointmentStatus } from "@/lib/status";
import type { ApiCalendarEvent } from "@hauck/core";

const MAX_ROWS = 4;

export function UpcomingAppointments({
  events,
  isLoading,
  isError,
  onRetry,
}: {
  events: ApiCalendarEvent[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  // Future events only, soonest first. Events without a start time sort last.
  const rows = useMemo(() => {
    const now = Date.now();
    return (events ?? [])
      .filter((e) => {
        if (!e.startTime) return false;
        const t = new Date(e.startTime).getTime();
        return !Number.isNaN(t) && t >= now;
      })
      .sort(
        (a, b) =>
          new Date(a.startTime as string).getTime() - new Date(b.startTime as string).getTime(),
      )
      .slice(0, MAX_ROWS);
  }, [events]);

  return (
    <Panel className="flex min-h-0 flex-col overflow-hidden">
      <PanelHeader kicker="Schedule" title="Upcoming appointments" />
      {isLoading ? (
        <ul className="divide-y divide-divider">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      ) : isError ? (
        <ErrorState description="The calendar failed to load." onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={22} />}
          title="Nothing on the books"
          description="Upcoming bookings will appear here as they are scheduled."
        />
      ) : (
        <ul className="divide-y divide-divider">
          {rows.map((ev) => (
            <li key={ev.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={ev.contactName || ev.title} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[13.5px] font-medium text-text">
                    {ev.title || ev.contactName || "Appointment"}
                  </p>
                  <StatusPill meta={appointmentStatus(ev.status)} />
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 font-data text-[11.5px] text-faint tnum">
                  <span>{formatDate(ev.startTime, { weekday: "short", month: "short", day: "numeric" })}</span>
                  <span aria-hidden>·</span>
                  <span>{formatTime(ev.startTime)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
