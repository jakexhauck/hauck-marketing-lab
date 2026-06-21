import { useMemo } from "react";
import { CalendarClock, MapPin, User, Video } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import NotificationBell from "../NotificationBell";
import EmptyState from "../EmptyState";
import { groupByDayKey } from "../../lib/dayGroups";
import { useAuth } from "../../context/AuthContext";
import { useCalendarEventsQuery } from "../../hooks/useApi";
import type { ApiCalendarEvent } from "../../lib/api";

// The Atelier desktop Calendar: a calm agenda of upcoming appointments grouped
// by day. The phone keeps its own (NavyHero + sheet) layout below lg; this file
// renders only inside `hidden lg:flex` from the Calendar route.

// Date/time formatters bound to the location timezone, falling back to the
// device timezone when GHL did not report one.
function makeFormatters(tz: string | null) {
  const opts = (o: Intl.DateTimeFormatOptions) =>
    tz ? { ...o, timeZone: tz } : o;
  return {
    time: new Intl.DateTimeFormat("en-US", opts({ hour: "numeric", minute: "2-digit" })),
    dayHeader: new Intl.DateTimeFormat("en-US", opts({ weekday: "long", month: "short", day: "numeric" })),
    dayKey: new Intl.DateTimeFormat("en-CA", opts({ year: "numeric", month: "2-digit", day: "2-digit" })),
  };
}

interface DayGroup {
  key: string;
  label: string;
  events: ApiCalendarEvent[];
}

export default function CalendarDesktop() {
  const { session } = useAuth();
  const useReal = Boolean(session);
  const query = useCalendarEventsQuery(useReal);

  const tz = query.data?.timezone ?? null;
  const events = useMemo(() => query.data?.events ?? [], [query.data]);
  const fmt = useMemo(() => makeFormatters(tz), [tz]);

  const groups = useMemo<DayGroup[]>(() => {
    const todayKey = fmt.dayKey.format(new Date());
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = fmt.dayKey.format(tomorrow);

    const byDay = groupByDayKey(events, (ev) => {
      if (!ev.startTime) return null;
      const d = new Date(ev.startTime);
      return Number.isNaN(d.getTime()) ? null : fmt.dayKey.format(d);
    });

    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, evs]) => {
        let label: string;
        if (key === todayKey) label = "Today";
        else if (key === tomorrowKey) label = "Tomorrow";
        else label = fmt.dayHeader.format(new Date(evs[0].startTime as string));
        return { key, label, events: evs };
      });
  }, [events, fmt]);

  const countLabel = query.isLoading
    ? "Loading..."
    : `${events.length} upcoming, next 30 days`;

  return (
    <DesktopPage
      title="Calendar"
      subtitle={countLabel}
      actions={<NotificationBell enabled={useReal} variant="surface" />}
    >
      {query.isError ? (
        <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
          Failed to load calendar.{" "}
          {(query.error as Error | null)?.message ?? "Try again."}
        </div>
      ) : query.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
            aria-hidden
          />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface py-6">
          <EmptyState
            title="No appointments"
            message="Booked appointments for the next 30 days will show up here."
          />
        </div>
      ) : (
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          {groups.map((g) => (
            <section key={g.key} className="flex flex-col gap-3">
              <div className="flex items-baseline gap-3">
                <h2 className="font-display text-[15px] font-semibold text-text">
                  {g.label}
                </h2>
                <span className="font-data text-[12px] text-faint tabular-nums">
                  {g.events.length}{" "}
                  {g.events.length === 1 ? "appointment" : "appointments"}
                </span>
              </div>

              <ul className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
                {g.events.map((ev, idx) => (
                  <li
                    key={ev.id}
                    className={
                      idx === g.events.length - 1
                        ? ""
                        : "border-b border-divider"
                    }
                  >
                    <EventRow event={ev} fmt={fmt} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </DesktopPage>
  );
}

function EventRow({
  event,
  fmt,
}: {
  event: ApiCalendarEvent;
  fmt: ReturnType<typeof makeFormatters>;
}) {
  const start = event.startTime ? new Date(event.startTime) : null;
  const end = event.endTime ? new Date(event.endTime) : null;
  const startLabel = start ? fmt.time.format(start) : "--";
  const endLabel = end ? fmt.time.format(end) : null;
  const hasAddress = event.address.trim().length > 0;
  const hasMeeting = event.meetingUrl.trim().length > 0;
  const hasContact = event.contactName.trim().length > 0;

  return (
    <div className="flex items-start gap-5 px-6 py-4 transition-colors hover:bg-surface-2">
      {/* Time column */}
      <div className="w-20 shrink-0 pt-0.5">
        <div className="font-data text-[14px] font-semibold text-text tabular-nums">
          {startLabel}
        </div>
        {endLabel && (
          <div className="font-data text-[12px] text-faint tabular-nums">
            {endLabel}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[15px] font-semibold text-text">
          {event.title}
        </div>

        <div className="mt-1.5 flex flex-col gap-1.5 text-[13px] text-muted">
          {hasContact && (
            <div className="flex items-center gap-2">
              <User size={14} className="shrink-0 text-faint" aria-hidden />
              <span className="truncate">{event.contactName}</span>
            </div>
          )}
          {hasAddress && (
            <div className="flex items-start gap-2">
              <MapPin
                size={14}
                className="mt-0.5 shrink-0 text-faint"
                aria-hidden
              />
              <span className="break-words">{event.address}</span>
            </div>
          )}
          {hasMeeting && (
            <a
              href={event.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 font-semibold text-brand-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <Video size={14} className="shrink-0" aria-hidden />
              <span className="break-all">Join meeting</span>
            </a>
          )}
          {!hasContact && !hasAddress && !hasMeeting && (
            <div className="flex items-center gap-2 text-faint">
              <CalendarClock size={14} className="shrink-0" aria-hidden />
              <span>No additional details</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
