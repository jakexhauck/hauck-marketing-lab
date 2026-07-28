import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildBookingWeeks, cursorForIso, isoOf } from "../../../lib/bookingCalendar";
import {
  DOW_LABELS,
  cursorForToday,
  monthLabel,
  nextMonth,
  prevMonth,
  type MonthCursor,
  type TodayRef,
} from "../../../lib/trackerMonth";
import { CALLBACK_TIMES, formatTime, normalizeTime } from "../../../lib/callbackTimes";

// When to call them back: a month grid and the times beside it.
//
// Deliberately the same shape as BookingPanel, because a caller does this and
// that with the same hand. The difference is what is being picked: booking
// offers the agency's real free slots and refuses anything else, while a
// callback is a promise made out loud on the phone and any time can be agreed.
// So every future day is live here and the times are a plain list.
//
// The time is OPTIONAL and stays optional. "Call me Thursday" is a real thing a
// prospect says; making the caller invent 2pm to get past this panel would put
// an appointment on the screen that nobody agreed to.

interface Props {
  date: string;
  time: string;
  onChange: (next: { date: string; time: string }) => void;
  onConfirm: () => void;
  confirmLabel?: string;
  busy?: boolean;
}

export default function CallbackPicker({
  date,
  time,
  onChange,
  onConfirm,
  confirmLabel = "Save and next",
  busy,
}: Props) {
  const today = useMemo<TodayRef>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  }, []);

  // Opens on the month of the date already chosen, so re-opening the panel does
  // not throw away where somebody was.
  const [cursor, setCursor] = useState<MonthCursor>(
    () => cursorForIso(date) ?? cursorForToday(today),
  );

  // Every day is available; the grid's own isPast flag does the disabling. The
  // empty set is what says "this is not a slots calendar".
  const weeks = useMemo(
    () => buildBookingWeeks(cursor, today, new Set<string>()),
    [cursor, today],
  );

  const chosenTime = normalizeTime(time);
  const todayIso = isoOf(today.year, today.month, today.day);

  return (
    <div className="mt-3 rounded-[var(--radius-lg)] border border-border p-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(240px,290px)_1fr]">
        {/* The month */}
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
            <span className="font-display text-[13.5px] font-semibold">
              {monthLabel(cursor)}
            </span>
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
              <div key={d} className="py-1 text-[11px] font-semibold text-faint">
                {d.slice(0, 1)}
              </div>
            ))}

            {weeks.flat().map((cell, i) => {
              const iso = cell.iso;
              if (!iso) return <div key={`pad-${i}`} />;
              const on = iso === date;
              // Yesterday cannot be agreed to, and today can: "call me back in
              // an hour" is the most common callback there is.
              const disabled = iso < todayIso;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  aria-pressed={on}
                  onClick={() => onChange({ date: iso, time: chosenTime })}
                  className={[
                    "rounded-[var(--radius)] py-1.5 text-[13px] font-medium transition-colors",
                    on
                      ? "bg-brand text-white"
                      : disabled
                        ? "cursor-not-allowed text-faint opacity-45"
                        : cell.isToday
                          ? "border border-brand text-brand hover:bg-surface-2"
                          : "text-text hover:bg-surface-2",
                  ].join(" ")}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>

        {/* The time */}
        <div className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-[12.5px] font-semibold text-muted">
              Time {date ? "" : "(pick a day first)"}
            </span>
            {chosenTime && (
              <button
                type="button"
                className="pk-link !text-[12px]"
                onClick={() => onChange({ date, time: "" })}
              >
                Clear
              </button>
            )}
          </div>

          <div className="grid max-h-[196px] grid-cols-3 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-4">
            {CALLBACK_TIMES.map((t) => {
              const on = t === chosenTime;
              return (
                <button
                  key={t}
                  type="button"
                  disabled={!date}
                  aria-pressed={on}
                  onClick={() => onChange({ date, time: on ? "" : t })}
                  className={[
                    "rounded-full border px-2 py-1.5 text-[12px] font-semibold transition-colors",
                    on
                      ? "border-brand bg-brand text-white"
                      : "border-border text-muted hover:border-brand hover:text-brand",
                    !date ? "cursor-not-allowed opacity-45" : "",
                  ].join(" ")}
                >
                  {formatTime(t)}
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-[11.5px] text-faint">
            A time is optional. Without one the callback is just that day.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-3 border-t border-divider pt-3">
        <span className="mr-auto text-[12.5px] text-muted">
          {date
            ? chosenTime
              ? `Calling back on ${date} at ${formatTime(chosenTime)}`
              : `Calling back on ${date}`
            : "No day picked yet"}
        </span>
        <button
          type="button"
          className="pk-btn-save"
          disabled={!date || busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
