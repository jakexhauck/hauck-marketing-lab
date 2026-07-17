import { MapPin, Users, Video } from "lucide-react";
import {
  type CalendarItem,
  CALENDAR_SOURCE_META,
  groupItemsByDay,
} from "../../lib/calendarModel";
import { formatLongDay, formatMoney } from "../../lib/jobsPipeline";
import EmptyState from "../EmptyState";

// Direction 3: a vertical stream of days, each a rich color-striped card. The
// details (who, where, how much) live on the card, so nothing needs a click.
export function AgendaView({
  items,
  todayIso,
}: {
  items: CalendarItem[];
  todayIso: string;
}) {
  const groups = groupItemsByDay(items);
  if (groups.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface py-6">
        <EmptyState
          title="Nothing scheduled"
          message="Estimates and jobs will show up here as they are booked."
        />
      </div>
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-4">
      {groups.map((g) => (
        <section key={g.iso} className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-[15px] font-semibold text-text">
              {formatLongDay(g.iso)}
              {g.iso === todayIso && (
                <span
                  className="ml-2 rounded-full px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-white"
                  style={{ backgroundImage: "var(--grad-brand)" }}
                >
                  Today
                </span>
              )}
            </h2>
            <span className="font-data text-[12px] text-faint">
              {g.items.length} {g.items.length === 1 ? "item" : "items"}
            </span>
          </div>
          <ul className="flex flex-col gap-3">
            {g.items.map((item) => (
              <li key={item.id}>
                <AgendaCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function AgendaCard({ item }: { item: CalendarItem }) {
  const meta = CALENDAR_SOURCE_META[item.source];
  return (
    <div className="flex overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <span
        className="w-1 shrink-0"
        style={{ background: `var(${meta.varName})` }}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3.5">
        <div className="w-16 shrink-0">
          <div className="font-data text-[14px] font-semibold tabular-nums text-text">
            {item.timeLabel || "All day"}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[14.5px] font-semibold text-text">
            {item.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
            {item.subtitle && (
              <span className="inline-flex items-center gap-1.5">
                <Users size={13} className="text-faint" aria-hidden />
                {item.subtitle}
              </span>
            )}
            {item.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={13} className="text-faint" aria-hidden />
                {item.location}
              </span>
            )}
            {item.meetingUrl && (
              <a
                href={item.meetingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-brand-text hover:underline"
              >
                <Video size={13} aria-hidden />
                Join
              </a>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {item.amount != null && (
            <span className="font-display text-[15px] font-semibold text-text">
              {formatMoney(item.amount)}
            </span>
          )}
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-wide"
            style={{
              background: `var(${meta.tintVar})`,
              color: `var(${meta.varName})`,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: `var(${meta.varName})` }}
            />
            {meta.label}
          </span>
        </div>
      </div>
    </div>
  );
}
