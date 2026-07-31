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
  // every cell with grey chips and drown the actual work, so it never becomes a
  // pill; Week and Agenda are where time-of-day conflicts matter.
  //
  // It is not dropped outright though: a client with no jobs booked yet but a
  // full personal calendar saw a blank month straight after linking, which
  // reads as a link that silently failed. Busy survives as a per-day count.
  const { busy: busyItems, rest: workItems } = useMemo(
    () => splitBusy(items),
    [items],
  );
  const selected = selectedIso ? itemsOnDay(workItems, selectedIso) : [];
  const selectedBusy = selectedIso ? itemsOnDay(busyItems, selectedIso) : [];

  return (
    // Desktop: grid beside a 300px day panel, both filling the locked frame.
    // Phone: one column that flows down the page, grid first at a fixed row
    // height, then the same day panel underneath it. The panel used to be
    // hidden below lg, which left tapping a day doing nothing visible at all.
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-cols-[1fr_300px]">
      {/* Grid */}
      <div className="flex shrink-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface lg:min-h-0 lg:shrink">
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
        {/* Fixed 58px rows on the phone (the page scrolls past them); at lg the
            six rows stretch to fill whatever height the frame gives them. */}
        <div className="grid auto-rows-[58px] grid-cols-7 lg:min-h-0 lg:flex-1 lg:auto-rows-auto lg:grid-rows-6">
          {weeks.flat().map((cell) => {
            const dayItems = itemsOnDay(workItems, cell.iso);
            const busyCount = itemsOnDay(busyItems, cell.iso).length;
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
                {/* lg only: labelled pills. A phone cell is ~48px wide, which
                    truncated every one of these to "8…" and told the client
                    nothing. Dots below carry the same signal in the space that
                    actually exists, and the day panel carries the words. */}
                <span className="hidden min-h-0 flex-col gap-1 lg:flex">
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
                </span>
                {/* Pinned to the cell floor by mt-auto so it never competes with
                    the job pills, and only ever a count: the app reads
                    availability, so there is no title to show even here. */}
                {busyCount > 0 && (
                  <span
                    className="mt-auto hidden items-center gap-1 px-1 text-[10px] font-semibold lg:flex"
                    style={{ color: "var(--source-busy)" }}
                  >
                    <span
                      className="h-1 w-1 shrink-0 rounded-full"
                      style={{ background: "var(--source-busy)" }}
                    />
                    {busyCount} busy
                  </span>
                )}
                {/* Phone: one dot per item, capped at four so a busy day cannot
                    push the row taller than its neighbours. Busy time from the
                    client's own calendar gets a single grey dot at the end. */}
                <span className="mt-auto flex flex-wrap items-center gap-[3px] lg:hidden">
                  {dayItems.slice(0, 4).map((item) => (
                    <span
                      key={item.id}
                      className="h-[5px] w-[5px] rounded-full"
                      style={{
                        background: `var(${CALENDAR_SOURCE_META[item.source].varName})`,
                      }}
                    />
                  ))}
                  {busyCount > 0 && (
                    <span
                      className="h-[5px] w-[5px] rounded-full"
                      style={{ background: "var(--source-busy)" }}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day detail. Visible at every width: on the phone this is the only place
          a day's work is ever spelled out, since the cells above are dots. */}
      <aside className="flex shrink-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface lg:min-h-0 lg:shrink">
        <div className="border-b border-divider px-4 py-3">
          <div className="font-display text-[14px] font-semibold text-text">
            {selectedIso ? formatLongDay(selectedIso) : "Pick a day"}
          </div>
          <div className="text-[12px] text-muted">
            {selected.length} {selected.length === 1 ? "item" : "items"}
            {selectedBusy.length > 0 && `, ${selectedBusy.length} busy`}
          </div>
        </div>
        {/* The phone lets this grow with its content and scrolls the page; at lg
            it is a fixed-height column with its own scroll beside the grid. */}
        <div className="p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {selected.length === 0 ? (
            <p className="px-1 py-6 text-center text-[12.5px] text-faint">
              {selectedBusy.length > 0
                ? "No jobs booked. Your own calendar has time taken on this day."
                : "Nothing scheduled."}
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
