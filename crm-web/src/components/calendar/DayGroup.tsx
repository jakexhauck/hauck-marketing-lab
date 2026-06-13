import { Panel } from "@/components/ui";
import { cn } from "@/lib/cn";
import { EventRow } from "./EventRow";
import type { DayGroup as Day } from "./agenda";

// One day of the agenda: a sticky header that names the day plus a count, over a
// panel of time-ordered rows. "Today" is accented so it stays findable while
// scrolling a long schedule.
export function DayGroup({ day }: { day: Day }) {
  const isToday = day.offset === 0;
  const isPast = day.offset < 0;

  return (
    <section>
      <div
        className={cn(
          "sticky top-0 z-10 -mx-1 flex items-baseline gap-2.5 bg-bg/85 px-1 py-2 backdrop-blur",
        )}
      >
        <h3
          className={cn(
            "font-display text-[15px] leading-none",
            isToday ? "text-brand-text" : "text-text",
          )}
        >
          {day.label}
        </h3>
        {isToday && (
          <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
        )}
        <span className="font-data text-[12px] text-faint tnum">
          {day.events.length}
        </span>
      </div>

      <Panel className="mt-1.5 divide-y divide-divider overflow-hidden">
        {day.events.map((event) => (
          <EventRow key={event.id} event={event} past={isPast} />
        ))}
      </Panel>
    </section>
  );
}
