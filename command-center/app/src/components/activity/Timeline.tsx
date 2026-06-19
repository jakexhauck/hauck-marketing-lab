import { useMemo } from "react";
import type { ApiActivity, ApiNotification } from "../../lib/api";
import { Panel } from "../ui";
import { Skeleton } from "../ui";
import { groupByDay } from "./groupByDay";
import { EventRow } from "./EventRow";

// The shared event feed: events grouped under sticky day headers, rendered as a
// single calm column. `unread`/`onMarkRead` are only supplied by the
// notification view; the activity log passes neither.
export function Timeline({
  events,
  isUnread,
  onMarkRead,
}: {
  events: (ApiActivity | ApiNotification)[];
  isUnread?: (event: ApiActivity | ApiNotification) => boolean;
  onMarkRead?: (id: number) => void;
}) {
  const groups = useMemo(() => groupByDay(events), [events]);

  return (
    <Panel className="overflow-hidden">
      {groups.map((group) => (
        <section key={group.key}>
          <header className="sticky top-0 z-10 border-b border-divider bg-surface-2/90 px-4 py-1.5 backdrop-blur">
            <span className="label-cap text-faint">{group.label}</span>
          </header>
          <ul className="divide-y divide-divider">
            {group.events.map((event) => {
              const unread = isUnread?.(event) ?? false;
              return (
                <li key={event.id}>
                  <EventRow event={event} unread={unread} onMarkRead={onMarkRead} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Panel>
  );
}

// Loading placeholder that mirrors the timeline shape (a day header plus a few
// event rows) so the layout does not jump when data arrives.
export function TimelineSkeleton() {
  return (
    <Panel className="overflow-hidden" aria-busy>
      <div className="border-b border-divider bg-surface-2 px-4 py-1.5">
        <Skeleton className="h-3 w-16" />
      </div>
      <ul className="divide-y divide-divider">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="flex gap-3 px-4 py-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2 py-0.5">
              <Skeleton className="h-3.5 w-[70%]" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
