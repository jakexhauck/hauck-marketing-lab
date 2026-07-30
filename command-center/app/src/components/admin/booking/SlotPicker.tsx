import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildBookingWeeks,
  cursorForIso,
  firstAvailableIso,
} from "../../../lib/bookingCalendar";
import {
  DOW_LABELS,
  cursorForToday,
  monthLabel,
  nextMonth,
  prevMonth,
  type MonthCursor,
  type TodayRef,
} from "../../../lib/trackerMonth";

// Pick a real free slot: a month grid, and the chosen day's times beside it.
//
// Shared by the two places the agency books its own calendar: a demo from a cold
// call, and a new client's onboarding call. Both offer times GoHighLevel said
// were free, and neither lets a time be TYPED, which is what makes "booked" true
// rather than hopeful.
//
// The shape is GoHighLevel's own booking page: month on the left, times on the
// right. A day with no free time is shown and dead rather than missing, so an
// empty week reads as "nothing that week" instead of as data that failed to
// load.
//
// Presentational on purpose. It is handed days and reports back what was
// clicked; who is being booked, onto which calendar, and what happens next all
// belong to the caller.

export interface SlotDay {
  date: string;
  slots: string[];
}

const DEFAULT_MINUTES = 30;

/**
 * The end of a slot.
 *
 * Derived rather than read off the calendar, because a booking always needs a
 * range and the free-slots response only gives starts.
 */
export function endOf(slot: string, minutes = DEFAULT_MINUTES): string {
  const start = new Date(slot);
  return new Date(start.getTime() + minutes * 60_000).toISOString();
}

export function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function timeLabel(slot: string): string {
  return new Date(slot).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function SlotPicker({
  days,
  slot,
  onPickSlot,
}: {
  days: SlotDay[];
  slot: string;
  onPickSlot: (slot: string) => void;
}) {
  const [day, setDay] = useState("");
  // The real today, read once, then injected so the grid math stays pure.
  const today = useMemo<TodayRef>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  }, []);
  const [cursor, setCursor] = useState<MonthCursor>(() => cursorForToday(today));

  // Keep the chosen day pointing at something bookable as the data arrives, and
  // open the grid on the month that day is in. The first day WITH times, not
  // merely the first day: landing on a fully booked today shows an empty column.
  useEffect(() => {
    if (!days.length) {
      setDay("");
      return;
    }
    if (days.some((d) => d.date === day)) return;
    const first = firstAvailableIso(days) ?? days[0].date;
    setDay(first);
    const c = cursorForIso(first);
    // Only when the month actually changes. cursorForIso builds a fresh object
    // every call, and storing an equal-but-new one is a state change as far as
    // React is concerned: with a caller that rebuilds `days` each render, that
    // is an effect that re-triggers itself forever.
    setCursor((prev) =>
      c && (c.year !== prev.year || c.month !== prev.month) ? c : prev,
    );
  }, [days, day]);

  const availableDates = useMemo(
    () => new Set(days.filter((d) => d.slots.length > 0).map((d) => d.date)),
    [days],
  );

  const weeks = useMemo(
    () => buildBookingWeeks(cursor, today, availableDates),
    [cursor, today, availableDates],
  );

  const daySlots = days.find((d) => d.date === day)?.slots ?? [];

  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(240px,272px)_1fr]">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            className="rounded-[var(--radius)] p-1.5 text-muted transition-colors hover:bg-brand/10 hover:text-brand"
            aria-label="Previous month"
            onClick={() => setCursor(prevMonth(cursor))}
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <span className="font-display text-[13.5px] font-semibold">{monthLabel(cursor)}</span>
          <button
            type="button"
            className="rounded-[var(--radius)] p-1.5 text-muted transition-colors hover:bg-brand/10 hover:text-brand"
            aria-label="Next month"
            onClick={() => setCursor(nextMonth(cursor))}
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {DOW_LABELS.map((d) => (
            <span key={d} className="py-1 text-[10.5px] font-semibold uppercase text-faint">
              {d.slice(0, 2)}
            </span>
          ))}

          {weeks.flat().map((cell, i) => {
            if (!cell.iso) return <span key={`pad-${i}`} />;
            const on = cell.iso === day;
            const disabled = !cell.hasSlots;
            return (
              <button
                key={cell.iso}
                type="button"
                disabled={disabled}
                aria-current={on ? "date" : undefined}
                onClick={() => {
                  setDay(cell.iso!);
                  onPickSlot("");
                }}
                className={[
                  "relative aspect-square rounded-[var(--radius)] text-[12.5px] font-medium transition-colors",
                  on
                    ? "bg-brand text-white"
                    : disabled
                      ? "text-faint"
                      : "text-text hover:bg-brand/10",
                  cell.isToday && !on ? "ring-1 ring-brand/40" : "",
                ].join(" ")}
              >
                {cell.day}
                {cell.hasSlots && !on && (
                  <span
                    aria-hidden
                    className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 font-display text-[13.5px] font-semibold">
          {day ? dayLabel(day) : "Pick a day"}
        </div>
        {daySlots.length === 0 ? (
          <p className="text-[13px] text-muted">Nothing free on this day.</p>
        ) : (
          <div className="grid max-h-[230px] grid-cols-2 gap-1.5 overflow-y-auto pr-1 lg:grid-cols-3">
            {daySlots.map((sl) => (
              <button
                key={sl}
                type="button"
                onClick={() => onPickSlot(sl)}
                className={[
                  "rounded-[var(--radius)] border px-2 py-2 font-mono text-[12.5px] transition-colors",
                  sl === slot
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-text hover:border-brand",
                ].join(" ")}
              >
                {timeLabel(sl)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
