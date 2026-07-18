import { useMemo } from "react";
import {
  type CalendarItem,
  CALENDAR_SOURCE_META,
  itemsOnDay,
  splitBusy,
} from "../../lib/calendarModel";
import { monthGrid, formatLongDay } from "../../lib/jobsPipeline";

// Direction 1: a full month grid with colored pills per day (up to three then a
// "+N more" overflow) beside a detail panel for the selected day.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthView({
  items,
  year,
  month,
  todayIso,
  selectedIso,
  onSelectDay,
}: {
  items: CalendarItem[];
  year: number;
  month: number;
  todayIso: string;
  selectedIso: string | null;
  onSelectDay: (iso: string) => void;
}) {
  const weeks = monthGrid(year, month);
  // Month is an overview. Busy time from the client's own calendar would fill
  // every cell with grey chips and drown the actual work, so it is dropped
  // here; Week and Agenda are where time-of-day conflicts matter.
  const workItems = useMemo(() => splitBusy(items).rest, [items]);
  const selected = selectedIso ? itemsOnDay(workItems, selectedIso) : [];

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_300px]">
      {/* Grid */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
        <div className="grid grid-cols-7 border-b border-border bg-surface-2">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="py-2 text-center text-[10.5px] font-bold uppercase tracking-wide text-faint"
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
          {weeks.flat().map((cell) => {
            const dayItems = itemsOnDay(workItems, cell.iso);
            const isToday = cell.iso === todayIso;
            const isSel = cell.iso === selectedIso;
            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => onSelectDay(cell.iso)}
                className={
                  "flex min-h-0 flex-col items-stretch gap-1 overflow-hidden border-b border-r border-divider p-1.5 text-left transition-colors hover:bg-surface-2 " +
                  (cell.inMonth ? "" : "bg-surface-2/40 ") +
                  (isSel ? "ring-1 ring-inset ring-brand " : "")
                }
              >
                <span
                  className={
                    "self-start text-[12px] font-semibold " +
                    (cell.inMonth ? "text-text" : "text-faint")
                  }
                >
                  {isToday ? (
                    <span
                      className="grid h-[22px] w-[22px] place-items-center rounded-full text-white"
                      style={{ backgroundImage: "var(--grad-brand)" }}
                    >
                      {cell.day}
                    </span>
                  ) : (
                    cell.day
                  )}
                </span>
                {dayItems.slice(0, 3).map((item) => {
                  const meta = CALENDAR_SOURCE_META[item.source];
                  return (
                    <span
                      key={item.id}
                      className="flex items-center gap-1 truncate rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-semibold"
                      style={{
                        background: `var(${meta.tintVar})`,
                        color: `var(${meta.varName})`,
                      }}
                    >
                      <span
                        className="h-1 w-1 shrink-0 rounded-full"
                        style={{ background: `var(${meta.varName})` }}
                      />
                      <span className="truncate">
                        {item.timeLabel &&
                          `${item.timeLabel.replace(":00", "")} `}
                        {item.title}
                      </span>
                    </span>
                  );
                })}
                {dayItems.length > 3 && (
                  <span className="px-1 text-[10px] font-bold text-muted">
                    +{dayItems.length - 3} more
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day detail */}
      <aside className="hidden min-h-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface lg:flex">
        <div className="border-b border-divider px-4 py-3">
          <div className="font-display text-[14px] font-semibold text-text">
            {selectedIso ? formatLongDay(selectedIso) : "Pick a day"}
          </div>
          <div className="text-[12px] text-muted">
            {selected.length} {selected.length === 1 ? "item" : "items"}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {selected.length === 0 ? (
            <p className="px-1 py-6 text-center text-[12.5px] text-faint">
              Nothing scheduled.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {selected.map((item) => {
                const meta = CALENDAR_SOURCE_META[item.source];
                return (
                  <li
                    key={item.id}
                    className="flex gap-2.5 rounded-[10px] border border-border p-2.5"
                    style={{ borderLeft: `3px solid var(${meta.varName})` }}
                  >
                    <div
                      className="w-12 shrink-0 font-data text-[11.5px] font-semibold"
                      style={{ color: `var(${meta.varName})` }}
                    >
                      {item.timeLabel || "All day"}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-display text-[12.5px] font-semibold text-text">
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="truncate text-[11px] text-muted">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
