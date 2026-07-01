import { cn } from "../../lib/cn";
import {
  CALENDAR_SOURCE_ORDER,
  CALENDAR_SOURCE_META,
  type CalendarSource,
} from "../../lib/calendarModel";

// The source legend that doubles as show/hide filters. A dimmed chip is either
// toggled off or a stream with no live source yet (still shown so the client
// knows it is coming).
export function SourceLegend({
  active,
  counts,
  connected,
  onToggle,
}: {
  active: Set<CalendarSource>;
  counts: Record<CalendarSource, number>;
  connected: Record<CalendarSource, boolean>;
  onToggle: (s: CalendarSource) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CALENDAR_SOURCE_ORDER.map((source) => {
        const meta = CALENDAR_SOURCE_META[source];
        const on = active.has(source);
        return (
          <button
            key={source}
            type="button"
            onClick={() => onToggle(source)}
            aria-pressed={on}
            title={
              connected[source]
                ? undefined
                : "Turns on once this is connected"
            }
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 font-display text-[12px] font-semibold text-text transition-opacity",
              on ? "opacity-100" : "opacity-40",
            )}
          >
            <span
              className="h-2.5 w-2.5 rounded-[3px]"
              style={{ background: `var(${meta.varName})` }}
            />
            {meta.plural}
            <span className="font-data text-[11px] text-faint">
              {counts[source] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
