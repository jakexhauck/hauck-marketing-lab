import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, TriangleAlert } from "lucide-react";
import { Segmented } from "../../ui";
import CalendarViews, { type CalendarView } from "../../calendar/CalendarViews";
import BookSlotPanel from "./BookSlotPanel";
import { useSetterEventsQuery, useSetterBusyQuery } from "../../../hooks/useApi";
import type { ApiSetterContact, ApiSetterEventsResponse } from "../../../lib/api";
import { appointmentToItem, busyToItem, type CalendarSource } from "../../../lib/calendarModel";
import { toIso } from "../../../lib/jobsPipeline";
import { NO_TIME_PICKED, type BookingIntent, type SetterSlot } from "../../../lib/setterBooking";

interface Props {
  tenantId: string;
  clientName: string;
  // A one-shot hand-off from the cockpit's Book appointment button: open the
  // booking panel already pointed at this contact and appointment type. The
  // parent clears it via onBookingHandled once consumed.
  bookingIntent?: BookingIntent | null;
  onBookingHandled?: () => void;
}

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "agenda", label: "Agenda" },
];

// How many of the client's calendars failed to load, as a number the banner can
// pluralise off. Floors at 1 when the route reports incomplete without a usable
// count, because "some calendars did not load" must never render as "0".
function failedCalendarCount(data: ApiSetterEventsResponse | undefined): number {
  if (!data?.incomplete) return 0;
  return data.failedCalendars > 0 ? data.failedCalendars : 1;
}

// The Setter Suite Calendar tab: one client's booked appointments and Google
// busy hours as a grid a setter can book into.
//
// It shows appointments and busy ONLY. Pipeline estimates and jobs are
// deliberately absent, which is why `connected` reports estimate and job as
// false: the legend must not offer a filter for two streams this tab never
// loads, or an empty count reads as "this client has no work booked".
//
// CalendarViews owns the anchor date, the previous/next stepping, the range
// label and the source legend as private state. There is no prop to drive any
// of them, so this toolbar carries only what it can actually control (the view
// and the Book button) and lets the controls row underneath do the rest. A
// second set of arrows here would be dead chrome.
export function SetterCalendar({ tenantId, clientName, bookingIntent, onBookingHandled }: Props) {
  const queryClient = useQueryClient();

  // Week is the default because it is the only view with a slot layer, so it is
  // the only one a setter can book from.
  const [view, setView] = useState<CalendarView>("week");
  const [range, setRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [slot, setSlot] = useState<SetterSlot | null>(null);
  // The contact + calendar seeded when the panel is opened from the cockpit.
  // Cleared on a manual Book so a grid-click open never inherits them.
  const [seedContact, setSeedContact] = useState<ApiSetterContact | null>(null);
  const [seedCalendarId, setSeedCalendarId] = useState("");

  // Consume the cockpit hand-off once, on mount (the tab mounts fresh each time
  // it is opened). Open the slot list with no time picked, seeded with the
  // contact and appointment type, then tell the parent to drop the intent.
  useEffect(() => {
    if (!bookingIntent) return;
    setSeedContact(bookingIntent.contact);
    setSeedCalendarId(bookingIntent.calendarId);
    setSlot({ iso: toIso(new Date()), startMinutes: NO_TIME_PICKED });
    onBookingHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable identity, or the child's reporting effect re-fires on every render
  // and loops. Same-value writes are also short-circuited so a re-report of the
  // unchanged range does not re-key both queries.
  const onRangeChange = useCallback((start: string, end: string) => {
    setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  const eventsQuery = useSetterEventsQuery(tenantId, range.start, range.end, !!tenantId);
  const busyQuery = useSetterBusyQuery(tenantId, range.start, range.end, !!tenantId);

  const items = useMemo(
    () => [
      ...(eventsQuery.data?.events ?? []).map(appointmentToItem),
      ...(busyQuery.data?.busy ?? []).map(busyToItem),
    ],
    [eventsQuery.data, busyQuery.data],
  );

  const connected: Record<CalendarSource, boolean> = {
    estimate: false,
    job: false,
    appointment: true,
    busy: busyQuery.data?.connected ?? false,
  };

  const failed = failedCalendarCount(eventsQuery.data);

  // Only once the request has actually answered. `connected` defaults to false
  // above so the grid renders sanely while in flight, but saying the client has
  // not linked a calendar before we know is just wrong.
  const noCalendarLink = busyQuery.data?.connected === false;

  // Opening with no time picked. Prefer today when today is on screen, so the
  // panel's slot list starts where the setter is looking; otherwise the first
  // day of the visible range.
  // Clear any cockpit-seeded contact/type, so a manual Book (toolbar or grid
  // click) never inherits the last hand-off.
  const clearSeed = () => {
    setSeedContact(null);
    setSeedCalendarId("");
  };

  const closePanel = () => {
    setSlot(null);
    clearSeed();
  };

  const openBook = () => {
    clearSeed();
    const today = toIso(new Date());
    const onScreen = !!range.start && !!range.end && today >= range.start && today <= range.end;
    setSlot({
      iso: onScreen ? today : range.start || today,
      startMinutes: NO_TIME_PICKED,
    });
  };

  const onBooked = () => {
    // The new appointment has to appear on the grid behind the panel, or the
    // setter's next click can offer the slot they just filled. Keyed on the
    // tenant so every cached week for this client refetches, not only the one
    // currently on screen.
    queryClient.invalidateQueries({ queryKey: ["admin", "setter-events", tenantId] });
    closePanel();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented options={VIEW_OPTIONS} value={view} onChange={setView} size="sm" />

        <button
          type="button"
          onClick={openBook}
          className="ml-auto inline-flex items-center gap-1.5 rounded-[var(--radius)] px-3 py-1.5 font-display text-[12.5px] font-semibold text-white shadow-[var(--shadow-brand)]"
          style={{ backgroundImage: "var(--grad-brand)" }}
        >
          <CalendarPlus size={14} aria-hidden />+ Book
        </button>
      </div>

      {/* A partially loaded grid is the one failure on this tab that can hurt a
          real customer: a calendar that did not load leaves its appointments
          invisible, and the setter books straight over them. The route answers
          200 with whatever did load rather than blanking the tab, so this line
          is the only thing that tells them. */}
      {failed > 0 && (
        <p className="flex items-start gap-2 text-[12.5px] text-warning">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {failed === 1
              ? "1 calendar could not be loaded, so this grid may be incomplete."
              : `${failed} calendars could not be loaded, so this grid may be incomplete.`}{" "}
            Check the booking system before offering a time.
          </span>
        </p>
      )}

      {/* Honest empty state, not filler: busy hours are simply not available for
          a client who never linked their calendar, and a setter reading an
          all-clear week needs to know which one they are looking at. */}
      {noCalendarLink && (
        <p className="text-[12.5px] text-muted">
          {clientName} has not linked a Google Calendar, so busy hours are not shown.
        </p>
      )}

      <CalendarViews
        items={items}
        connected={connected}
        view={view}
        onRangeChange={onRangeChange}
        onSlotClick={(iso, startMinutes) => {
          clearSeed();
          setSlot({ iso, startMinutes });
        }}
      />

      <BookSlotPanel
        tenantId={tenantId}
        slot={slot}
        onClose={closePanel}
        onBooked={onBooked}
        initialContact={seedContact}
        initialCalendarId={seedCalendarId}
      />
    </div>
  );
}

export default SetterCalendar;
