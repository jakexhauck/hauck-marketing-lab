import { useState } from "react";
import { X, CalendarClock, Check, AlertCircle } from "lucide-react";
import { useFreeSlots } from "../hooks/useApi";
import { ApiError } from "../lib/api";
import { cn } from "../lib/cn";

// Shared booking modal: fetches a calendar's real available slots (server
// resolves the calendar by name), lets the user pick one, and hands the chosen
// start/end back to the parent, which owns the actual write (create appointment,
// then the stage move / follow-up). Reused by Leads (book intro call / in-person
// visit) and any other "pick a real slot" action.
//
// Honest degrade: a round-robin calendar with no team members returns 422
// needs_staff; we show a clear "needs staff assigned" note instead of an empty
// list or a generic error, so a real session never sees a broken picker.

interface SlotPickerModalProps {
  title: string;
  subtitle?: string;
  calendarName: string;
  durationMinutes: number;
  confirmLabel: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (times: { startTime: string; endTime: string }) => void;
}

// Display the wall-clock time encoded in the slot's own offset (e.g. the "12:00"
// in "2026-07-08T12:00:00-04:00"), so the label matches the business's local
// calendar regardless of the viewer's timezone.
function slotLabel(iso: string): string {
  const hm = iso.slice(11, 16);
  const [hRaw, m] = hm.split(":");
  let h = Number(hRaw);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ap}`;
}

function dayLabel(date: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// End time = start instant + duration, as an ISO string. GHL parses any valid
// ISO 8601 instant, so a UTC end paired with an offset start is accepted.
function endFrom(startIso: string, minutes: number): string {
  return new Date(new Date(startIso).getTime() + minutes * 60_000).toISOString();
}

export function SlotPickerModal({
  title,
  subtitle,
  calendarName,
  durationMinutes,
  confirmLabel,
  pending,
  onClose,
  onConfirm,
}: SlotPickerModalProps) {
  const { data, isLoading, error } = useFreeSlots(calendarName, true);
  const [picked, setPicked] = useState<string | null>(null);

  const needsStaff =
    error instanceof ApiError &&
    (error.body as { error?: string } | null)?.error === "needs_staff";
  const notFound =
    error instanceof ApiError &&
    (error.body as { error?: string } | null)?.error === "calendar_not_found";

  function confirm() {
    if (!picked) return;
    onConfirm({ startTime: picked, endTime: endFrom(picked, durationMinutes) });
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(15,18,48,0.42)] p-5"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-[460px] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-border px-[22px] pb-3.5 pt-5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand/10 text-brand">
            <CalendarClock size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[16.5px] font-semibold text-text">
              {title}
            </div>
            {subtitle && (
              <div className="mt-0.5 text-[12.5px] text-muted">{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-surface-2 text-muted"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-[22px] py-4">
          {isLoading && (
            <div className="grid place-items-center py-12 text-[13px] text-muted">
              Loading available times…
            </div>
          )}

          {!isLoading && needsStaff && (
            <div className="flex items-start gap-2.5 rounded-[12px] border border-border bg-surface-2 px-3.5 py-3 text-[12.5px] text-muted">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-500" />
              <span>
                This calendar has no team member assigned yet, so online booking
                is off. Add a staff member to the “{calendarName}” calendar in
                your booking setup and this turns on.
              </span>
            </div>
          )}

          {!isLoading && notFound && (
            <div className="flex items-start gap-2.5 rounded-[12px] border border-border bg-surface-2 px-3.5 py-3 text-[12.5px] text-muted">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-500" />
              <span>
                We could not find the “{calendarName}” calendar. Check the
                calendar name in your booking setup.
              </span>
            </div>
          )}

          {!isLoading && error && !needsStaff && !notFound && (
            <div className="flex items-start gap-2.5 rounded-[12px] border border-border bg-surface-2 px-3.5 py-3 text-[12.5px] text-muted">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-500" />
              <span>Could not load available times. Please try again.</span>
            </div>
          )}

          {!isLoading && !error && data && data.days.length === 0 && (
            <div className="grid place-items-center py-12 text-center text-[13px] text-muted">
              No open times in the next two weeks.
            </div>
          )}

          {!isLoading && !error && data && data.days.length > 0 && (
            <div className="space-y-4">
              {data.days.map((day) => (
                <div key={day.date}>
                  <div className="mb-2 font-display text-[13px] font-semibold text-text">
                    {dayLabel(day.date)}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {day.slots.map((slot) => {
                      const on = picked === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setPicked(slot)}
                          className={cn(
                            "rounded-[9px] border px-3 py-1.5 font-display text-[12.5px] font-semibold transition-colors",
                            on
                              ? "border-brand bg-brand text-white shadow-[var(--shadow-brand)]"
                              : "border-border bg-surface text-text hover:border-brand/40",
                          )}
                        >
                          {slotLabel(slot)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-[22px] py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-border bg-surface px-3.5 py-2 font-display text-[13px] font-semibold text-text hover:border-brand/40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!picked || pending}
            className="inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 font-display text-[13px] font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-50"
            style={{ backgroundImage: "var(--grad-brand)" }}
          >
            <Check size={15} /> {pending ? "Booking…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
