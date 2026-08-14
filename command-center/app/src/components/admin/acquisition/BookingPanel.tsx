import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import type { AdminLead } from "../../../lib/api";
import { formatPhoneDashed } from "../../../lib/phone";
import {
  useBookColdCall,
  useColdCallCalendarsQuery,
  useColdCallSlotsQuery,
} from "../../../hooks/useColdCall";
import {
  buildBookingWeeks,
  cursorForIso,
  firstAvailableIso,
} from "../../../lib/bookingCalendar";
// The server's own check, imported rather than reimplemented, so the button and
// the endpoint cannot come to disagree about what an email address is. The same
// crossing is made in src/context/PipelinesContext.tsx.
import { cleanEmail } from "../../../../functions/lib/bookingContact";
import {
  DOW_LABELS,
  cursorForToday,
  monthLabel,
  nextMonth,
  prevMonth,
  type MonthCursor,
  type TodayRef,
} from "../../../lib/trackerMonth";

// Booking a meeting on Hauck Marketing's own calendar, from the call.
//
// WHO the meeting is with is asked here, not assumed. A scraped prospect is a
// BUSINESS: a company name and a switchboard number, no person and usually no
// email. Worse, the company arrives split across the first and last name
// columns, so the contact GoHighLevel would otherwise create is called "BM
// Heating & Cooling". That name is what {{contact.name}} renders from, which
// means it reaches the calendar invite, every reminder and every automation the
// prospect actually sees.
//
// The name is learned while somebody is on the phone, which is the only moment
// there is anyone to type it, so the fields that matter to an invite sit above
// the grid and are prefilled from whatever is known.
//
// Clearing the LAST NAME is the point of the surname box being here at all: a
// person usually gives a first name and nothing else, and half a company cannot
// be left behind as their surname. The company is not lost, it moves to
// Business, which is prefilled with the stored name when the book has no
// business of its own to offer.
//
// A blank business, phone or email keeps what is stored. What is typed is merged
// over it and written back to the lead, so the next person to open this prospect
// sees the person rather than the switchboard.
//
// Real slots, read live from GoHighLevel, because the alternative is a caller
// offering a time that is already taken and then having to take it back. The
// slots are the agency's actual availability, in the agency's timezone, and the
// booking creates the prospect as a contact in GHL so the reminders GHL sends
// have somewhere to go.
//
// The panel deliberately does not let a time be typed. Every offer is a slot the
// calendar said was free, which is what makes "boom, booked" true.
//
// Laid out as a month grid with the chosen day's times beside it, which is the
// shape GoHighLevel's own booking page uses. A day with no free time is dead on
// the grid rather than missing from it, so "nothing that week" is visible
// instead of being inferred from a gap in a row of chips.

const DEFAULT_MINUTES = 30;

// Slot strings arrive as "2026-07-26T14:30:00-04:00". The end time is derived
// rather than assumed from the calendar, so a booking always carries a range.
function endOf(slot: string, minutes = DEFAULT_MINUTES): string {
  const start = new Date(slot);
  return new Date(start.getTime() + minutes * 60_000).toISOString();
}

function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function timeLabel(slot: string): string {
  return new Date(slot).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

interface Props {
  lead: AdminLead;
  onBooked: (appointmentDate: string) => void;
  onCancel: () => void;
}

export default function BookingPanel({ lead, onBooked, onCancel }: Props) {
  const calendars = useColdCallCalendarsQuery();
  const [calendarId, setCalendarId] = useState("");
  const [day, setDay] = useState("");
  // The real today, read once, then injected so the grid math stays pure.
  const today = useMemo<TodayRef>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  }, []);
  const [cursor, setCursor] = useState<MonthCursor>(() => cursorForToday(today));
  const [slot, setSlot] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Prefilled from the book, then owned by the caller. Held as separate state
  // rather than read straight off `lead` so typing does not fight a refetch
  // landing mid-sentence.
  const [firstName, setFirstName] = useState(lead.firstName ?? "");
  const [lastName, setLastName] = useState(lead.lastName ?? "");
  // The company, falling back to the stored name when the book holds no business
  // of its own. That fallback IS the scraped-business case: for a lead imported
  // with the company in the name columns, this is the only place it exists, and
  // the caller is about to type a person over it. Shown rather than inferred
  // server-side, so what lands in GoHighLevel is something a human read first.
  const [businessName, setBusinessName] = useState(
    lead.businessName || `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim(),
  );
  // Prefilled in the shape a person reads, not the shape it is stored in. Safe
  // because the server normalises whatever comes back and resolveBookingContact
  // compares the NORMALISED value, so leaving this untouched is still "no
  // change" rather than a rewrite of the column.
  const [phone, setPhone] = useState(formatPhoneDashed(lead.phone));
  const [email, setEmail] = useState(lead.email ?? "");

  const book = useBookColdCall();
  const slots = useColdCallSlotsQuery(calendarId);

  // There is exactly one calendar a cold call books into, and the endpoint
  // returns only that one (functions/lib/coldCallCalendar.ts). This used to be a
  // select over all three agency calendars that merely DEFAULTED to a demo one,
  // which meant Onboarding stayed one click away for anybody in a hurry.
  const calendar = calendars.data?.calendars?.[0] ?? null;

  useEffect(() => {
    if (!calendar || calendarId === calendar.id) return;
    setCalendarId(calendar.id);
  }, [calendar, calendarId]);

  const days = useMemo(() => slots.data?.days ?? [], [slots.data]);

  // Keep the chosen day pointing at something bookable as the data arrives or
  // the calendar changes, and open the grid on the month that day is in. The
  // first day WITH times, not merely the first day: landing on a fully booked
  // today just shows an empty column.
  useEffect(() => {
    if (!days.length) {
      setDay("");
      return;
    }
    if (days.some((d) => d.date === day)) return;
    const first = firstAvailableIso(days) ?? days[0].date;
    setDay(first);
    const c = cursorForIso(first);
    if (c) setCursor(c);
  }, [days, day]);

  // Which days the calendar offered anything on, for the dots in the grid.
  const availableDates = useMemo(
    () => new Set(days.filter((d) => d.slots.length > 0).map((d) => d.date)),
    [days],
  );

  const weeks = useMemo(
    () => buildBookingWeeks(cursor, today, availableDates),
    [cursor, today, availableDates],
  );

  const daySlots = days.find((d) => d.date === day)?.slots ?? [];

  // A booking needs an email address, so the button refuses without one and says
  // which of the two things is wrong. The server refuses too: this only means
  // the caller finds out before picking a time rather than after.
  const emailOk = Boolean(cleanEmail(email));
  const emailTyped = Boolean(email.trim());

  const confirm = async () => {
    if (!slot || !calendarId || !emailOk) return;
    setError(null);
    try {
      const res = await book.mutateAsync({
        leadId: lead.id,
        calendarId,
        startTime: slot,
        endTime: endOf(slot),
        // Sent as typed, and the names sent even when empty. The server
        // normalises and validates them (functions/lib/bookingContact.ts),
        // because the rules a booking is accepted on must not be enforceable
        // only by the browser.
        firstName,
        lastName,
        businessName,
        phone,
        email,
      });
      onBooked(res.appointmentDate);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not book that time.";
      setError(
        message === "needs_staff"
          ? "That calendar has nobody assigned to it in GoHighLevel."
          : message === "not_configured"
            ? "The agency GoHighLevel account is not connected yet."
            : message === "calendar_not_found"
              ? "That calendar no longer exists in GoHighLevel."
              : message,
      );
    }
  };

  if (calendars.isLoading) {
    return <div className="pk-needs">Loading the calendar...</div>;
  }
  if (calendars.data && !calendars.data.configured) {
    return (
      <div className="pk-needs">
        The agency GoHighLevel account is not connected, so meetings cannot be booked yet.
      </div>
    );
  }
  // No cold call calendar means no booking, deliberately. Falling back to the
  // next most plausible calendar is what this change exists to stop, and a
  // caller told plainly is better than a meeting quietly on the wrong diary.
  if (!calendar) {
    return (
      <div className="pk-needs">
        No cold call calendar in GoHighLevel. Meetings are booked into the calendar whose name
        includes &quot;Cold Call&quot;, and the agency account has none right now.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-[var(--radius-lg)] border border-border p-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Stated, not chosen. The calendar is a fact about the booking rather
            than a decision the caller makes on the call. */}
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
          <CalendarCheck size={14} aria-hidden className="text-muted" />
          {calendar.name}
        </span>
        <button
          type="button"
          className="pk-btn-cancel"
          onClick={() => void slots.refetch()}
          disabled={slots.isFetching}
        >
          <RefreshCw size={13} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
          {slots.isFetching ? "Checking..." : "Refresh times"}
        </button>
        {slots.data?.timezone && (
          <span className="text-[12px] text-muted">Times in {slots.data.timezone}</span>
        )}
      </div>

      {/* Who the invite is for. Above the calendar deliberately: it is the
          thing being learned on the call, and burying it under the grid would
          make it the step people skip. */}
      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            First name
          </span>
          <input
            className="pk-input"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Who you spoke to"
            autoComplete="off"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            Last name
          </span>
          <input
            className="pk-input"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Leave empty if you did not get it"
            autoComplete="off"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            Business
          </span>
          <input
            className="pk-input"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="BM Heating &amp; Cooling"
            autoComplete="off"
          />
        </label>
      </div>
      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            Phone
          </span>
          <input
            className="pk-input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(248) 555-0171"
            inputMode="tel"
            autoComplete="off"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            Email
          </span>
          <input
            className="pk-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            inputMode="email"
            autoComplete="off"
          />
        </label>
      </div>
      <p className="mt-1.5 text-[12px] text-faint">
        GoHighLevel sends the reminders to these, and they are saved back onto the prospect.
      </p>

      {slots.isLoading ? (
        <p className="mt-3 text-[13px] text-muted">Reading the calendar...</p>
      ) : slots.isError ? (
        <p className="mt-3 text-[13px] text-danger">
          Could not read that calendar&apos;s free times.
        </p>
      ) : days.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted">
          No free times on that calendar in the next month.
        </p>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-[minmax(240px,272px)_1fr]">
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
                <span key={d} className="py-1 text-[10.5px] font-semibold uppercase text-faint">
                  {d.slice(0, 2)}
                </span>
              ))}

              {weeks.flat().map((cell, i) => {
                if (!cell.iso) return <span key={`pad-${i}`} />;
                const on = cell.iso === day;
                // A day with no free time is shown and dead, so an empty week
                // reads as "nothing that week" rather than as missing data.
                const disabled = !cell.hasSlots;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={disabled}
                    aria-current={on ? "date" : undefined}
                    onClick={() => {
                      setDay(cell.iso!);
                      setSlot("");
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

          {/* The chosen day's times */}
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
                    onClick={() => setSlot(sl)}
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
      )}

      {error && <div className="pk-form-error">{error}</div>}

      <div className="pk-form-actions">
        <button
          type="button"
          className="pk-btn-save"
          disabled={!slot || !emailOk || book.isPending}
          onClick={() => void confirm()}
        >
          <CalendarCheck size={14} aria-hidden style={{ marginRight: 7, verticalAlign: -2 }} />
          {/* The reason, on the button. A control that is simply dead makes the
              caller hunt for what is wrong while somebody waits on the line. */}
          {book.isPending
            ? "Booking..."
            : !emailOk
              ? emailTyped
                ? "Check their email address"
                : "Add their email to book"
              : slot
                ? `Book ${dayLabel(day)} at ${timeLabel(slot)}`
                : "Pick a time"}
        </button>
        <button type="button" className="pk-btn-cancel" onClick={onCancel} disabled={book.isPending}>
          Cancel
        </button>
      </div>
    </div>
  );
}
