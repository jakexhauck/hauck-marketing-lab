import { useEffect, useState } from "react";
import { CalendarClock, Loader2, TriangleAlert } from "lucide-react";
import { useSetterSlotsQuery, useSetterBookMutation } from "../../../hooks/useApi";
import { useToast } from "../../../context/ToastContext";
import { ApiError } from "../../../lib/api";
import { formatSlotDay, formatSlotTime, computeSlotEnd } from "../../../lib/setterCockpit";

interface Props {
  tenantId: string;
  contactId: string;
  leadName: string;
}

const DAYS_AHEAD = 14;
// Typing "Estimate" one keystroke at a time must not fire eight live CRM
// lookups (a calendars list plus a free-slots call, each), so the value that
// actually drives the query only updates once typing has paused.
const CALENDAR_NAME_DEBOUNCE_MS = 400;
const fieldClass =
  "w-full rounded-[var(--radius)] border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-text outline-none placeholder:text-faint focus:border-brand/50";

// Live slot lookup + booking, scoped to a calendar chosen by name (the
// Setter Suite works every pipeline for a client, so there is no single
// fixed calendar to hardcode the way the client-facing "Home Estimate"
// visit flow does; see functions/api/admin/setter/slots.ts + book.ts, both
// generic on calendarName). A day selector narrows the live slot grid to
// one day at a time so the docked panel stays compact.
//
// The name field starts empty and the live lookup is driven by a debounced
// copy of it (CALENDAR_NAME_DEBOUNCE_MS below), not the raw keystroke value:
// every keystroke would otherwise fire a calendars list plus a free-slots
// call, both against the live client's API token, and flash a
// "could not find a calendar" error for every incomplete prefix. Starting
// empty also matters on its own: a hardcoded default here would be shaped
// for one client (Willis's "Home Estimate") and error on first paint for
// every other client on this cross-client screen.
//
// Booking is terminal: functions/api/admin/setter/book.ts deliberately does
// not retry (a retry can double-book a real customer), and this component
// honours that by disabling the Book button the instant the mutation is
// in flight, with no retry wired anywhere in the call chain.
export default function SlotPicker({ tenantId, contactId, leadName }: Props) {
  const { showToast } = useToast();
  const [calendarName, setCalendarName] = useState("");
  const [debouncedCalendarName, setDebouncedCalendarName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedCalendarName(calendarName.trim()),
      CALENDAR_NAME_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [calendarName]);

  // useSetterSlotsQuery already gates on a non-empty calendar name
  // (src/hooks/useApi.ts), so an untouched or cleared field fires no request
  // at all rather than erroring on an empty lookup.
  const slotsQuery = useSetterSlotsQuery(tenantId, debouncedCalendarName, DAYS_AHEAD, true);
  const bookMutation = useSetterBookMutation();

  const days = slotsQuery.data?.days ?? [];

  // Keep the selected day valid as the live data changes (a fresh calendar
  // name, or a day that has since emptied out): fall back to the first day
  // with slots rather than showing an empty grid for a day the API no
  // longer lists.
  useEffect(() => {
    if (days.length === 0) {
      setSelectedDate(null);
      return;
    }
    if (!selectedDate || !days.some((d) => d.date === selectedDate)) {
      setSelectedDate(days[0].date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.map((d) => d.date).join(",")]);

  const activeDay = days.find((d) => d.date === selectedDate) ?? null;

  const err = slotsQuery.error;
  const errorCode =
    err instanceof ApiError && err.body && typeof err.body === "object"
      ? (err.body as { error?: string }).error
      : null;
  const needsStaff = errorCode === "needs_staff";
  const notFound = errorCode === "calendar_not_found";

  const book = () => {
    if (!picked || bookMutation.isPending) return;
    const endTime = computeSlotEnd(picked, durationMinutes);
    bookMutation.mutate(
      {
        tenantId,
        // The debounced value, not the raw field: it is what the displayed
        // slots were actually fetched for, so booking against it guarantees
        // the calendar matches the slot the setter picked.
        calendarName: debouncedCalendarName,
        contactId,
        startTime: picked,
        endTime,
        title: `Estimate for ${leadName}`,
      },
      {
        onSuccess: () => {
          showToast(`Booked ${formatSlotDay(picked.slice(0, 10))} at ${formatSlotTime(picked)}`);
          setPicked(null);
        },
        onError: (e) => {
          const code =
            e instanceof ApiError && e.body && typeof e.body === "object"
              ? (e.body as { error?: string }).error
              : null;
          if (code === "needs_staff") {
            showToast("This calendar has no team members assigned, so it cannot be booked.");
          } else {
            showToast("Could not book that time, please try again");
          }
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-faint">
          Calendar
          <input
            value={calendarName}
            onChange={(e) => {
              setCalendarName(e.target.value);
              setPicked(null);
            }}
            className={`${fieldClass} mt-1 normal-case`}
          />
        </label>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-faint">
          Duration (min)
          <input
            type="number"
            min={15}
            step={15}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Math.max(15, Number(e.target.value) || 60))}
            className={`${fieldClass} mt-1 normal-case`}
          />
        </label>
      </div>

      {!debouncedCalendarName && (
        <p className="py-2 text-[12.5px] text-muted">
          Enter a calendar name to see available times.
        </p>
      )}

      {!!debouncedCalendarName && slotsQuery.isLoading && (
        <div className="flex items-center gap-2 py-4 text-[12.5px] text-muted">
          <Loader2 size={14} className="animate-spin" /> Loading available times...
        </div>
      )}

      {!!debouncedCalendarName && !slotsQuery.isLoading && needsStaff && (
        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <span>This calendar has no team members assigned, so it cannot return availability.</span>
        </div>
      )}

      {!!debouncedCalendarName && !slotsQuery.isLoading && notFound && (
        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <span>Could not find a calendar named &quot;{debouncedCalendarName}&quot;. Check the name and try again.</span>
        </div>
      )}

      {!!debouncedCalendarName && !slotsQuery.isLoading && slotsQuery.isError && !needsStaff && !notFound && (
        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <span>Could not load available times. Try again.</span>
        </div>
      )}

      {!!debouncedCalendarName && !slotsQuery.isLoading && !slotsQuery.isError && days.length === 0 && (
        <p className="py-2 text-[12.5px] text-muted">
          No open times on this calendar in the next {DAYS_AHEAD} days.
        </p>
      )}

      {!!debouncedCalendarName && !slotsQuery.isLoading && !slotsQuery.isError && days.length > 0 && (
        <>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
            {days.map((d) => {
              const on = d.date === selectedDate;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => {
                    setSelectedDate(d.date);
                    setPicked(null);
                  }}
                  className={
                    "shrink-0 rounded-[var(--radius)] border px-2.5 py-1.5 font-display text-[12px] font-semibold transition-colors " +
                    (on
                      ? "border-brand bg-brand text-white shadow-[var(--shadow-brand)]"
                      : "border-border bg-surface text-text hover:border-brand/40")
                  }
                >
                  {formatSlotDay(d.date)}
                </button>
              );
            })}
          </div>

          {activeDay && (
            <div className="flex flex-wrap gap-1.5">
              {activeDay.slots.map((slot) => {
                const on = picked === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setPicked(slot)}
                    className={
                      "rounded-[var(--radius)] border px-2.5 py-1.5 font-display text-[12px] font-semibold transition-colors " +
                      (on
                        ? "border-brand bg-brand text-white shadow-[var(--shadow-brand)]"
                        : "border-border bg-surface text-text hover:border-brand/40")
                    }
                  >
                    {formatSlotTime(slot)}
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={book}
            disabled={!picked || bookMutation.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--radius)] px-3.5 py-2.5 font-display text-[13px] font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-50"
            style={{ backgroundImage: "var(--grad-brand)" }}
          >
            {bookMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CalendarClock size={14} />
            )}
            {bookMutation.isPending ? "Booking..." : picked ? "Book this time" : "Pick a time to book"}
          </button>
        </>
      )}
    </div>
  );
}
