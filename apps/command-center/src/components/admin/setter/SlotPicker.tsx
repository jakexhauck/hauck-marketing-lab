import { useEffect, useState } from "react";
import { CalendarClock, Loader2, TriangleAlert } from "lucide-react";
import {
  useSetterCalendarsQuery,
  useSetterSlotsQuery,
  useSetterBookMutation,
} from "../../../hooks/useApi";
import { useToast } from "../../../context/ToastContext";
import { ApiError } from "../../../lib/api";
import { formatSlotDay, formatSlotTime, computeSlotEnd } from "../../../lib/setterCockpit";

interface Props {
  tenantId: string;
  contactId: string;
  leadName: string;
}

const DAYS_AHEAD = 14;
const fieldClass =
  "w-full rounded-[var(--radius)] border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-text outline-none placeholder:text-faint focus:border-brand/50";
const noticeClass =
  "flex items-start gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted";

// Live slot lookup + booking, scoped to a calendar chosen from the client's
// real calendar list (GET /api/admin/setter/calendars). The Setter Suite
// works every pipeline for every client, so there is no single fixed
// calendar to hardcode the way the client-facing "Home Estimate" visit flow
// does; both functions/api/admin/setter/slots.ts and book.ts are generic on
// calendarId. A day selector narrows the live slot grid to one day at a time
// so the docked panel stays compact.
//
// This used to be a free-text calendar NAME field behind a 400ms debounce,
// because every keystroke fired a calendars list plus a free-slots call
// against the live client's API token. A dropdown has no keystrokes: slots
// are fetched once per chosen calendar id and never on render, so the
// debounce is gone rather than left orphaned.
//
// The default is deliberate. One calendar means there is nothing to choose,
// so it is pre-selected; two or more means no default at all, because a
// wrong guess here books a real customer onto the wrong client calendar and
// nobody would see it happen.
//
// Booking is terminal: functions/api/admin/setter/book.ts deliberately does
// not retry (a retry can double-book a real customer), and this component
// honours that by disabling the Book button the instant the mutation is
// in flight, with no retry wired anywhere in the call chain.
export default function SlotPicker({ tenantId, contactId, leadName }: Props) {
  const { showToast } = useToast();
  const [calendarId, setCalendarId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const calendarsQuery = useSetterCalendarsQuery(tenantId, true);
  const calendars = calendarsQuery.data?.calendars ?? [];

  // Exactly one calendar means the choice is not a choice, so make it for
  // them. Anything else stays unselected on purpose.
  const soleCalendarId = calendars.length === 1 ? calendars[0].id : null;
  useEffect(() => {
    if (soleCalendarId) setCalendarId((cur) => cur || soleCalendarId);
  }, [soleCalendarId]);

  // useSetterSlotsQuery gates on a non-empty calendar id (src/hooks/useApi.ts),
  // so an unchosen calendar fires no request at all. The query key carries
  // the id, so changing the dropdown is what refetches, and only that.
  const slotsQuery = useSetterSlotsQuery(tenantId, calendarId, DAYS_AHEAD, true);
  const bookMutation = useSetterBookMutation();

  const days = slotsQuery.data?.days ?? [];
  const chosenCalendar = calendars.find((c) => c.id === calendarId) ?? null;

  // Keep the selected day valid as the live data changes (a different
  // calendar, or a day that has since emptied out): fall back to the first
  // day with slots rather than showing an empty grid for a day the API no
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
    if (!picked || !calendarId || bookMutation.isPending) return;
    const endTime = computeSlotEnd(picked, durationMinutes);
    bookMutation.mutate(
      {
        tenantId,
        // The same id the displayed slots were fetched for, so booking
        // cannot land on a different calendar than the one the setter saw.
        calendarId,
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
          } else if (code === "calendar_not_found") {
            showToast("That calendar no longer exists in the booking system.");
          } else {
            showToast("Could not book that time, please try again");
          }
        },
      },
    );
  };

  // A failed calendars fetch and a client with no calendars look identical
  // in an empty dropdown, and they are not the same thing: one is our
  // problem to retry, the other is the client's setup. So neither renders a
  // select at all.
  const calendarsLoading = calendarsQuery.isLoading;
  const calendarsFailed = calendarsQuery.isError;
  const calendarsEmpty = !calendarsLoading && !calendarsFailed && calendars.length === 0;
  const canPickCalendar = !calendarsLoading && !calendarsFailed && calendars.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-faint">
          Calendar
          {calendarsLoading && (
            <span className="mt-1 flex items-center gap-1.5 text-[12.5px] font-normal normal-case text-muted">
              <Loader2 size={13} className="animate-spin" /> Loading calendars...
            </span>
          )}
          {calendarsFailed && (
            <span className="mt-1 block text-[12.5px] font-normal normal-case text-muted">
              Could not load calendars.
            </span>
          )}
          {calendarsEmpty && (
            <span className="mt-1 block text-[12.5px] font-normal normal-case text-muted">
              No calendars.
            </span>
          )}
          {canPickCalendar && (
            <select
              value={calendarId}
              onChange={(e) => {
                setCalendarId(e.target.value);
                setPicked(null);
              }}
              aria-label="Calendar"
              className={`${fieldClass} mt-1 normal-case`}
            >
              {!soleCalendarId && <option value="">Choose a calendar</option>}
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
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

      {calendarsFailed && (
        <div className={noticeClass}>
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <span>
            Could not load this client&apos;s calendars, so booking is unavailable right now. This
            is a connection problem, not an empty calendar list. Try again.
          </span>
        </div>
      )}

      {calendarsEmpty && (
        <div className={noticeClass}>
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <span>
            This client has no active calendars in the booking system, so there is nothing to book
            into.
          </span>
        </div>
      )}

      {canPickCalendar && !calendarId && (
        <p className="py-2 text-[12.5px] text-muted">Choose a calendar to see available times.</p>
      )}

      {!!calendarId && slotsQuery.isLoading && (
        <div className="flex items-center gap-2 py-4 text-[12.5px] text-muted">
          <Loader2 size={14} className="animate-spin" /> Loading available times...
        </div>
      )}

      {!!calendarId && !slotsQuery.isLoading && needsStaff && (
        <div className={noticeClass}>
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <span>This calendar has no team members assigned, so it cannot return availability.</span>
        </div>
      )}

      {!!calendarId && !slotsQuery.isLoading && notFound && (
        <div className={noticeClass}>
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <span>
            The booking system no longer has
            {chosenCalendar ? ` "${chosenCalendar.name}"` : " that calendar"}. It may have been
            removed since this list loaded.
          </span>
        </div>
      )}

      {!!calendarId && !slotsQuery.isLoading && slotsQuery.isError && !needsStaff && !notFound && (
        <div className={noticeClass}>
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <span>Could not load available times. Try again.</span>
        </div>
      )}

      {!!calendarId && !slotsQuery.isLoading && !slotsQuery.isError && days.length === 0 && (
        <p className="py-2 text-[12.5px] text-muted">
          No open times on this calendar in the next {DAYS_AHEAD} days.
        </p>
      )}

      {!!calendarId && !slotsQuery.isLoading && !slotsQuery.isError && days.length > 0 && (
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
