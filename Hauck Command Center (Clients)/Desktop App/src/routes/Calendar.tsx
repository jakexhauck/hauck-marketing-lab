import { useMemo, useState } from "react";
import { CalendarDays, Clock, Globe } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, Segmented, type SegmentOption } from "@/components/ui";
import { useCalendarEventsQuery } from "@/hooks/useApi";
import { cn } from "@/lib/cn";
import { DayGroup } from "@/components/calendar/DayGroup";
import { AgendaSkeleton } from "@/components/calendar/AgendaSkeleton";
import {
  countOnDay,
  filterByScope,
  groupByDay,
  scopeCounts,
  type Scope,
} from "@/components/calendar/agenda";

// The Calendar surface: an operator's upcoming-appointments readout. Not a month
// grid, a vertical agenda that answers "what's next and who am I seeing". Times
// are grouped under smart day headers and scoped by a time filter.
export function Calendar() {
  const [scope, setScope] = useState<Scope>("upcoming");
  const query = useCalendarEventsQuery();

  // Recompute groups when data or scope changes. "now" is captured per render so
  // the upcoming/past split tracks the latest fetch without a ticking clock.
  const { groups, counts, upcomingCount, todayCount } = useMemo(() => {
    const events = query.data?.events ?? [];
    const nowDate = new Date();
    const nowMs = nowDate.getTime();
    const c = scopeCounts(events, nowMs);
    return {
      groups: groupByDay(filterByScope(events, scope, nowMs), nowDate),
      counts: c,
      upcomingCount: c.upcoming,
      todayCount: countOnDay(events, nowDate),
    };
  }, [query.data, scope]);

  const timezone = query.data?.timezone ?? null;
  const totalForScope = groups.reduce((sum, g) => sum + g.events.length, 0);

  const segments: SegmentOption<Scope>[] = [
    { value: "upcoming", label: "Upcoming", count: counts.upcoming },
    { value: "all", label: "All", count: counts.all },
    { value: "past", label: "Past", count: counts.past },
  ];

  return (
    <div>
      <PageHeader
        title="Calendar"
        count={query.isSuccess ? totalForScope : undefined}
        description={
          query.isSuccess && counts.all > 0 ? (
            <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
              <Stat icon={<Clock size={13} />} label="upcoming" value={upcomingCount} />
              <Stat icon={<CalendarDays size={13} />} label="today" value={todayCount} />
              {timezone && (
                <span className="inline-flex items-center gap-1.5 text-faint">
                  <Globe size={13} />
                  <span className="font-data text-[12px]">{timezone}</span>
                </span>
              )}
            </span>
          ) : (
            "Your appointment schedule."
          )
        }
        filters={
          query.isSuccess && counts.all > 0 ? (
            <Segmented options={segments} value={scope} onChange={setScope} />
          ) : undefined
        }
      />

      {query.isLoading && <AgendaSkeleton />}

      {query.isError && (
        <ErrorState
          title="Couldn't load the calendar"
          description="The appointment feed didn't respond. Try again."
          onRetry={() => query.refetch()}
        />
      )}

      {query.isSuccess && counts.all === 0 && (
        <EmptyState
          icon={<CalendarDays size={22} />}
          title="No appointments"
          description="Booked appointments will appear here as they come in."
        />
      )}

      {query.isSuccess && counts.all > 0 && groups.length === 0 && (
        <EmptyState
          icon={<Clock size={22} />}
          title={scope === "upcoming" ? "Nothing upcoming" : "Nothing here"}
          description={
            scope === "upcoming"
              ? "No appointments are scheduled ahead. Switch to All to see past ones."
              : "No appointments match this filter."
          }
        />
      )}

      {query.isSuccess && groups.length > 0 && (
        <div className="space-y-7">
          {groups.map((day) => (
            <DayGroup key={day.key} day={day} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-muted")}>
      <span className="text-faint">{icon}</span>
      <span className="font-data text-[13px] text-text tnum">{value}</span>
      <span className="text-[12.5px]">{label}</span>
    </span>
  );
}
