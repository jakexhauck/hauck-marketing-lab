import type { GhlContext } from "./ghl";
import type { BookingKind } from "./leadBoard";
import { loadEstimateCalendars } from "./estimateTracking";
import { fetchContactAppointments } from "./estimateOutcomeGhl";
import { slotEnd, type ContactAppointment } from "./estimateOutcome";
import { createAppointment, getCalendar, rescheduleAppointment } from "../api/lib/appointments";

// The Leads board books estimates and jobs as real appointments on the
// client's GHL calendars (Jake, 2026-10-10): "Home Estimate" for an estimate,
// "Job" for a job, found by name like the outcome page. So a board booking is
// counted on the Ads Dashboard and fires the calendar's own workflows, exactly
// as a booking made inside GHL.
//
// A lead that already has a live appointment on that calendar has it MOVED,
// never a second one booked: that is how the board reschedules.

// The appointment a re-book should move: the latest one on the calendar that
// is still live. Past ones count too, so "Rescheduled" after a missed visit
// moves it rather than leaving a stale booking behind.
export function openAppointment(appts: ContactAppointment[], calendarId: string): ContactAppointment | null {
  let best: ContactAppointment | null = null;
  for (const a of appts) {
    if (a.calendarId !== calendarId || a.deleted) continue;
    const s = a.status.toLowerCase();
    if (s.startsWith("cancel") || s === "showed" || s === "noshow" || s === "invalid") continue;
    if (!best || a.startTime > best.startTime) best = a;
  }
  return best;
}

// A booking carries what the owner's Google Calendar copy is written from
// (appointmentMirror / googleCalendar.mirrorAppointment).
export type BookResult =
  | { ok: true; appointmentId: string; title: string; startIso: string; endIso: string }
  | { ok: false; status: number; error: string };

export async function calendarFor(gctx: GhlContext, kind: BookingKind) {
  const cals = await loadEstimateCalendars(gctx).catch(() => null);
  return kind === "estimate" ? (cals?.estimate ?? null) : (cals?.job ?? null);
}

export async function bookOnCalendar(
  gctx: GhlContext,
  input: { kind: BookingKind; contactId: string; name: string; slot: string },
): Promise<BookResult> {
  const label = input.kind === "estimate" ? "Estimate" : "Job";
  const cal = await calendarFor(gctx, input.kind);
  if (!cal) return { ok: false, status: 409, error: `No ${label} calendar in this account.` };

  const meta = await getCalendar(gctx, cal.id);
  const end = slotEnd(input.slot, meta?.slotDuration, meta?.slotDurationUnit);
  const appts = await fetchContactAppointments(gctx, input.contactId).catch(() => []);
  const open = openAppointment(appts, cal.id);
  const title = `${label}: ${input.name}`;
  const booked = (appointmentId: string): BookResult => ({ ok: true, appointmentId, title, startIso: input.slot, endIso: end });

  if (open) {
    const moved = await rescheduleAppointment(gctx, open.id, input.slot, end);
    if (!moved.ok) return { ok: false, status: 409, error: "That time is not free any more. Pick another." };
    return booked(open.id);
  }

  const made = await createAppointment(gctx, {
    calendarId: cal.id,
    contactId: input.contactId,
    startTime: input.slot,
    endTime: end,
    title,
  });
  if (!made.ok) {
    return {
      ok: false,
      status: 409,
      error: made.needsStaff ? `The ${label} calendar has no team member on it.` : "That time is not free any more. Pick another.",
    };
  }
  return booked(made.id);
}
