import type { ApiSetterEvent } from "./api";

// Manual-confirm tracking for funnel-booked phone appointments.
//
// A lead who books through the funnel lands in the "Phone Appt Booked" stage
// and gets automated confirmation SMS/email. The automation moves them out
// once they confirm; a lead still sitting in that stage as the appointment
// approaches has NOT confirmed, and inside the final 24 hours the setter
// must call and confirm manually. This module is the pure logic behind that
// alert: which stages count, which booked event is "the" appointment, and
// whether the manual-confirm window is open.

export const CONFIRM_WINDOW_MS = 24 * 60 * 60 * 1000;

// The stage a funnel booking parks in until confirmed. Matched on the name
// so it survives both "Phone Appt Booked" and a spelled-out rename.
export function isApptBookedStage(stageName: string | undefined | null): boolean {
  if (!stageName) return false;
  const s = stageName.trim().toLowerCase();
  return s.includes("appt booked") || s.includes("appointment booked");
}

// The stage after confirmation. Its cockpit works the live call (SOP:
// reschedule / cancel actions against the tracked booking), so these leads
// need their appointment resolved too, WITHOUT the manual-confirm alert.
export function isApptConfirmedStage(stageName: string | undefined | null): boolean {
  if (!stageName) return false;
  const s = stageName.trim().toLowerCase();
  return s.includes("appt confirmed") || s.includes("appointment confirmed");
}

// Any stage whose leads should have their booked appointment looked up.
export function isApptTrackedStage(stageName: string | undefined | null): boolean {
  return isApptBookedStage(stageName) || isApptConfirmedStage(stageName);
}

export interface LeadAppointment {
  // The GHL event id, needed by the cancel/reschedule actions.
  id: string;
  startMs: number;
  title: string;
}

// Statuses that mean the booking no longer stands. GHL uses "cancelled";
// the spelling variants and no-shows are covered for safety.
function isDeadStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s.includes("cancel") || s.includes("noshow") || s.includes("no_show");
}

// The appointment this contact is being confirmed FOR: the earliest live
// booking still ahead of now. If nothing is ahead, the most recent past one
// is returned so the card can say the appointment came and went while the
// lead sat unconfirmed. Null when the contact has no live booking at all.
export function appointmentFor(
  contactId: string,
  events: ApiSetterEvent[],
  now: number,
): LeadAppointment | null {
  let nextFuture: LeadAppointment | null = null;
  let latestPast: LeadAppointment | null = null;
  for (const e of events) {
    if (e.contactId !== contactId || !e.startTime) continue;
    if (isDeadStatus(e.status)) continue;
    const startMs = new Date(e.startTime).getTime();
    if (Number.isNaN(startMs)) continue;
    const appt = { id: e.id, startMs, title: e.title };
    if (startMs > now) {
      if (!nextFuture || startMs < nextFuture.startMs) nextFuture = appt;
    } else if (!latestPast || startMs > latestPast.startMs) {
      latestPast = appt;
    }
  }
  return nextFuture ?? latestPast;
}

// due      -> inside the final 24h and the lead is still unconfirmed: alert.
// upcoming -> booked, but the confirm window has not opened yet.
// passed   -> the appointment time went by with the lead still in the stage.
export type ConfirmState = "due" | "upcoming" | "passed";

export function confirmState(appt: LeadAppointment, now: number): ConfirmState {
  if (appt.startMs <= now) return "passed";
  if (appt.startMs - now <= CONFIRM_WINDOW_MS) return "due";
  return "upcoming";
}

// "Wed, Jul 23, 2:30 PM" in the viewer's clock, which the app pins to the
// business's timezone elsewhere; good enough for an internal admin surface.
export function formatApptTime(startMs: number): string {
  return new Date(startMs).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
