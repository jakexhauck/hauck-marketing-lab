import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, RefreshCw } from "lucide-react";
import type { AdminLead } from "../../../lib/api";
import {
  useBookColdCall,
  useColdCallCalendarsQuery,
  useColdCallSlotsQuery,
} from "../../../hooks/useColdCall";

// Booking a meeting on Hauck Marketing's own calendar, from the call.
//
// Real slots, read live from GoHighLevel, because the alternative is a caller
// offering a time that is already taken and then having to take it back. The
// slots are the agency's actual availability, in the agency's timezone, and the
// booking creates the prospect as a contact in GHL so the reminders GHL sends
// have somewhere to go.
//
// The panel deliberately does not let a time be typed. Every offer is a slot the
// calendar said was free, which is what makes "boom, booked" true.

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
  const [slot, setSlot] = useState("");
  const [error, setError] = useState<string | null>(null);

  const book = useBookColdCall();
  const slots = useColdCallSlotsQuery(calendarId);

  // Default to the sales calendar rather than whichever happens to be first: a
  // discovery call belongs on the demo calendar, not on onboarding.
  useEffect(() => {
    if (calendarId || !calendars.data?.calendars?.length) return;
    const list = calendars.data.calendars;
    const demo = list.find((c) => /demo|discovery|sales/i.test(c.name)) ?? list[0];
    setCalendarId(demo.id);
  }, [calendars.data, calendarId]);

  const days = useMemo(() => slots.data?.days ?? [], [slots.data]);

  // Keep the chosen day pointing at something real as the data arrives or the
  // calendar changes.
  useEffect(() => {
    if (!days.length) {
      setDay("");
      return;
    }
    if (!days.some((d) => d.date === day)) setDay(days[0].date);
  }, [days, day]);

  const daySlots = days.find((d) => d.date === day)?.slots ?? [];

  const confirm = async () => {
    if (!slot || !calendarId) return;
    setError(null);
    try {
      const res = await book.mutateAsync({
        leadId: lead.id,
        calendarId,
        startTime: slot,
        endTime: endOf(slot),
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

  return (
    <div className="mt-3 rounded-[var(--radius-lg)] border border-border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="pk-select !w-auto"
          value={calendarId}
          onChange={(e) => {
            setCalendarId(e.target.value);
            setSlot("");
          }}
          aria-label="Calendar"
        >
          {(calendars.data?.calendars ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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

      {slots.isLoading ? (
        <p className="mt-3 text-[13px] text-muted">Reading the calendar...</p>
      ) : slots.isError ? (
        <p className="mt-3 text-[13px] text-danger">
          Could not read that calendar&apos;s free times.
        </p>
      ) : days.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted">
          No free times on that calendar in the next two weeks.
        </p>
      ) : (
        <>
          {/* Days */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {days.map((d) => (
              <button
                key={d.date}
                type="button"
                onClick={() => {
                  setDay(d.date);
                  setSlot("");
                }}
                className={[
                  "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                  d.date === day
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-muted hover:text-text",
                ].join(" ")}
              >
                {dayLabel(d.date)}
              </button>
            ))}
          </div>

          {/* Times */}
          <div className="mt-3 flex max-h-[190px] flex-wrap gap-1.5 overflow-y-auto">
            {daySlots.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSlot(s)}
                className={[
                  "rounded-[var(--radius)] border px-3 py-1.5 font-mono text-[12.5px] transition-colors",
                  s === slot
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-text hover:border-brand",
                ].join(" ")}
              >
                {timeLabel(s)}
              </button>
            ))}
          </div>
        </>
      )}

      {error && <div className="pk-form-error">{error}</div>}

      <div className="pk-form-actions">
        <button
          type="button"
          className="pk-btn-save"
          disabled={!slot || book.isPending}
          onClick={() => void confirm()}
        >
          <CalendarCheck size={14} aria-hidden style={{ marginRight: 7, verticalAlign: -2 }} />
          {book.isPending
            ? "Booking..."
            : slot
              ? `Book ${timeLabel(slot)}`
              : "Pick a time"}
        </button>
        <button type="button" className="pk-btn-cancel" onClick={onCancel} disabled={book.isPending}>
          Cancel
        </button>
      </div>
    </div>
  );
}
