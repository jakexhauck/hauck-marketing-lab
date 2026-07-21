import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, Search, TriangleAlert, X } from "lucide-react";
import {
  useSetterCalendarsQuery,
  useSetterSlotsQuery,
  useSetterContactSearchQuery,
  useSetterBookMutation,
} from "../../../hooks/useApi";
import { ApiError } from "../../../lib/api";
import type { ApiSetterContact } from "../../../lib/api";
import { DEFAULT_DURATION } from "../../../lib/calendarModel";
import { formatSlotDay, formatSlotTime, computeSlotEnd } from "../../../lib/setterCockpit";
import {
  slotToInstants,
  formatSlotHeader,
  hasPickedTime,
  type SetterSlot,
} from "../../../lib/setterBooking";

interface Props {
  tenantId: string;
  slot: SetterSlot | null;
  onClose: () => void;
  onBooked: () => void;
}

const DAYS_AHEAD = 14;
const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY = 2;

const fieldClass =
  "w-full rounded-[var(--radius)] border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-text outline-none placeholder:text-faint focus:border-brand/50";
const noticeClass =
  "flex items-start gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[12.5px] text-muted";
const pillClass =
  "shrink-0 rounded-[var(--radius)] border px-2.5 py-1.5 font-display text-[12px] font-semibold transition-colors ";
const pillOn = "border-brand bg-brand text-white shadow-[var(--shadow-brand)]";
const pillOff = "border-border bg-surface text-text hover:border-brand/40";

// Reads a GHL failure code off an ApiError body. Both the slots query and the
// book mutation answer with the same 422 vocabulary, so both are read the
// same way.
function errorCodeOf(err: unknown): string | null {
  return err instanceof ApiError && err.body && typeof err.body === "object"
    ? ((err.body as { error?: string }).error ?? null)
    : null;
}

// The booking slide-over for the Setter Suite Calendar tab. It opens from two
// gestures and the difference between them is the whole shape of the panel:
//
//   - Clicking an empty stretch of the week grid arrives with a real time, so
//     there is nothing to choose and the panel is only "who is this for".
//   - The toolbar Book button arrives with startMinutes -1, meaning no time at
//     all, so the panel falls back to the live free-slot list the cockpit's
//     SlotPicker already uses.
//
// The calendar dropdown, the day/slot pills and every error string here are
// deliberately the same as SlotPicker's. A setter works both surfaces in the
// same shift and a calendar that "has no team members assigned" in one place
// must not read differently in the other.
//
// Booking is terminal. functions/api/admin/setter/book.ts does not retry,
// because a retry double-books a real customer, so Confirm is disabled the
// instant the mutation is in flight.
export function BookSlotPanel({ tenantId, slot, onClose, onBooked }: Props) {
  const [calendarId, setCalendarId] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [contact, setContact] = useState<ApiSetterContact | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const open = slot !== null;
  const timed = hasPickedTime(slot);
  // Identity of the opened slot, so reopening on a different cell starts
  // clean rather than inheriting the previous contact.
  const slotKey = slot ? `${slot.iso}:${slot.startMinutes}` : "";

  const calendarsQuery = useSetterCalendarsQuery(tenantId, open);
  const calendars = useMemo(
    () => calendarsQuery.data?.calendars ?? [],
    [calendarsQuery.data],
  );

  // Match SlotPicker exactly: auto-select ONLY when the client has a single
  // calendar. With two or more, a wrong guess books a real customer onto the
  // wrong calendar and nobody sees it happen, so the setter has to choose.
  // The grid showing merged bookings is not a substitute for that decision:
  // it shows where appointments ARE, not where this one should go.
  const soleCalendarId = calendars.length === 1 ? calendars[0].id : null;
  useEffect(() => {
    if (soleCalendarId) setCalendarId((cur) => cur || soleCalendarId);
  }, [soleCalendarId]);

  // Reset per opening. Not per render: the panel stays mounted across a
  // close/reopen in SetterCalendar.
  useEffect(() => {
    setContact(null);
    setSearch("");
    setDebounced("");
    setPicked(null);
    setSelectedDate(null);
  }, [slotKey]);

  // Debounced so a typing setter does not fire a live CRM contact search per
  // keystroke against the client's own API token.
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const contactsQuery = useSetterContactSearchQuery(tenantId, debounced, open);
  const results = contactsQuery.data?.contacts ?? [];

  // Only the no-time-picked opening needs a slot list; a clicked cell already
  // has its time, so this stays disabled and costs nothing.
  const slotsQuery = useSetterSlotsQuery(tenantId, calendarId, DAYS_AHEAD, open && !timed);
  const days = useMemo(() => slotsQuery.data?.days ?? [], [slotsQuery.data]);
  const dayKey = days.map((d) => d.date).join(",");

  // Keep the chosen day valid as the live data changes underneath it.
  useEffect(() => {
    if (days.length === 0) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate((cur) => (cur && days.some((d) => d.date === cur) ? cur : days[0].date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey]);

  const activeDay = days.find((d) => d.date === selectedDate) ?? null;
  const chosenCalendar = calendars.find((c) => c.id === calendarId) ?? null;

  const bookMutation = useSetterBookMutation();

  const slotsCode = errorCodeOf(slotsQuery.error);
  const slotsNeedsStaff = slotsCode === "needs_staff";
  const slotsNotFound = slotsCode === "calendar_not_found";

  const bookCode = errorCodeOf(bookMutation.error);
  const bookError = bookMutation.isError
    ? bookCode === "needs_staff"
      ? "This calendar has no team members assigned, so it cannot be booked."
      : bookCode === "calendar_not_found"
        ? "That calendar no longer exists in the booking system."
        : "Could not book that time, please try again"
    : null;

  const calendarsLoading = calendarsQuery.isLoading;
  const calendarsFailed = calendarsQuery.isError;
  const calendarsEmpty = !calendarsLoading && !calendarsFailed && calendars.length === 0;
  const canPickCalendar = !calendarsLoading && !calendarsFailed && calendars.length > 0;

  const canConfirm =
    !!contact &&
    !!calendarId &&
    (timed || !!picked) &&
    !bookMutation.isPending;

  const confirm = () => {
    if (!slot || !contact || !calendarId || bookMutation.isPending) return;

    let startTime: string;
    let endTime: string;

    if (timed) {
      const instants = slotToInstants(slot, DEFAULT_DURATION);
      // Null means the clicked cell was not a real slot. There is nothing safe
      // to fall back to on a live customer calendar, so this books nothing.
      if (!instants) return;
      startTime = instants.startTime;
      endTime = instants.endTime;
    } else {
      if (!picked) return;
      startTime = picked;
      endTime = computeSlotEnd(picked, DEFAULT_DURATION);
    }

    bookMutation.mutate(
      { tenantId, calendarId, contactId: contact.id, startTime, endTime, title: `Estimate for ${contact.name}` },
      { onSuccess: () => onBooked() },
    );
  };

  if (!slot) return null;

  return (
    <aside
      role="dialog"
      aria-label="Book this slot"
      className="fixed inset-y-0 right-0 z-40 flex w-[302px] flex-col border-l border-border bg-surface shadow-[var(--shadow-lg)]"
    >
      <div className="flex items-start gap-3 border-b border-divider px-4 pb-3.5 pt-4">
        <div className="min-w-0 flex-1">
          <div className="font-display text-[15px] font-semibold text-text">Book this slot</div>
          <div className="mt-1 font-data text-[12px] text-muted">{formatSlotHeader(slot, DEFAULT_DURATION)}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close booking panel"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-text"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-faint">
          Calendar
          {calendarsLoading && (
            <span className="mt-1 flex items-center gap-1.5 text-[12.5px] font-normal normal-case text-muted">
              <Loader2 size={13} className="animate-spin" /> Loading calendars...
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

        {/* No time came in with the opening, so the setter picks one from the
            live free-slot list rather than from the grid. */}
        {!timed && !!calendarId && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">Time</span>

            {slotsQuery.isLoading && (
              <div className="flex items-center gap-2 py-2 text-[12.5px] text-muted">
                <Loader2 size={14} className="animate-spin" /> Loading available times...
              </div>
            )}

            {!slotsQuery.isLoading && slotsNeedsStaff && (
              <div className={noticeClass}>
                <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                <span>
                  This calendar has no team members assigned, so it cannot return availability.
                </span>
              </div>
            )}

            {!slotsQuery.isLoading && slotsNotFound && (
              <div className={noticeClass}>
                <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                <span>
                  The booking system no longer has
                  {chosenCalendar ? ` "${chosenCalendar.name}"` : " that calendar"}. It may have
                  been removed since this list loaded.
                </span>
              </div>
            )}

            {!slotsQuery.isLoading && slotsQuery.isError && !slotsNeedsStaff && !slotsNotFound && (
              <div className={noticeClass}>
                <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                <span>Could not load available times. Try again.</span>
              </div>
            )}

            {!slotsQuery.isLoading && !slotsQuery.isError && days.length === 0 && (
              <p className="text-[12.5px] text-muted">
                No open times on this calendar in the next {DAYS_AHEAD} days.
              </p>
            )}

            {!slotsQuery.isLoading && !slotsQuery.isError && days.length > 0 && (
              <>
                <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
                  {days.map((d) => (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => {
                        setSelectedDate(d.date);
                        setPicked(null);
                      }}
                      className={pillClass + (d.date === selectedDate ? pillOn : pillOff)}
                    >
                      {formatSlotDay(d.date)}
                    </button>
                  ))}
                </div>

                {activeDay && (
                  <div className="flex flex-wrap gap-1.5">
                    {activeDay.slots.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setPicked(s)}
                        className={pillClass + (picked === s ? pillOn : pillOff)}
                      >
                        {formatSlotTime(s)}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            Contact
            <div className="relative mt-1">
              <Search
                size={13}
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setContact(null);
                }}
                placeholder="Search name, phone or email"
                aria-label="Search contacts"
                className={`${fieldClass} pl-7 normal-case`}
              />
            </div>
          </label>

          {/* Existing contacts only. This panel never creates one: a setter
              typing a new customer into a live CRM mid-call is how duplicates
              get made. */}
          {contact ? (
            <div className="flex items-start gap-2 rounded-[var(--radius)] border border-brand/40 bg-surface-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-text">{contact.name}</div>
                {contact.phone && (
                  <div className="truncate font-data text-[11.5px] text-muted">{contact.phone}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setContact(null)}
                aria-label="Clear selected contact"
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-surface-3 hover:text-text"
              >
                <X size={11} />
              </button>
            </div>
          ) : (
            <>
              {search.trim().length > 0 && search.trim().length < MIN_QUERY && (
                <p className="text-[12px] text-faint">Type at least {MIN_QUERY} characters.</p>
              )}

              {contactsQuery.isFetching && (
                <div className="flex items-center gap-2 text-[12.5px] text-muted">
                  <Loader2 size={13} className="animate-spin" /> Searching...
                </div>
              )}

              {contactsQuery.isError && (
                <div className={noticeClass}>
                  <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                  <span>Could not search this client&apos;s contacts. Try again.</span>
                </div>
              )}

              {!contactsQuery.isFetching &&
                !contactsQuery.isError &&
                debounced.length >= MIN_QUERY &&
                results.length === 0 && (
                  <p className="text-[12.5px] text-muted">
                    No contact matches &quot;{debounced}&quot;.
                  </p>
                )}

              {results.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setContact(c)}
                        className="w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-brand/40"
                      >
                        <div className="truncate text-[12.5px] font-semibold text-text">{c.name}</div>
                        <div className="truncate font-data text-[11.5px] text-muted">
                          {c.phone || c.email || "No phone on file"}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {bookError && (
          <div className={noticeClass}>
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            <span>{bookError}</span>
          </div>
        )}
      </div>

      <div className="border-t border-divider px-4 py-3">
        <button
          type="button"
          onClick={confirm}
          disabled={!canConfirm}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius)] px-3.5 py-2.5 font-display text-[13px] font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-50"
          style={{ backgroundImage: "var(--grad-brand)" }}
        >
          {bookMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CalendarClock size={14} />
          )}
          {bookMutation.isPending ? "Booking..." : "Confirm booking"}
        </button>
      </div>
    </aside>
  );
}

export default BookSlotPanel;
