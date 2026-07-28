import type { ApiSetterEvent } from "./api";

// Manual-confirm tracking for booked phone appointments.
//
// A lead who books gets automated confirmation SMS/email. A lead who has NOT
// confirmed as the appointment approaches needs a manual call inside the final
// 24 hours. This module is the pure logic behind that alert: which leads count,
// which booked event is "the" appointment, and whether the window is open.
//
// Rebuilt 2026-07-28. Booked and confirmed used to be two separate CRM stages,
// which is what this module matched on. They are now two TAGS on one "Phone
// Appt" stage, so every check here reads tags; the stage only decides whether
// a lead has an appointment worth resolving at all. Matching on the old stage
// names silently returned false for every lead, which switched the whole
// alert off without anything appearing to break.

export const CONFIRM_WINDOW_MS = 24 * 60 * 60 * 1000;

// Tag comparison has to survive casing and stray spacing, since these strings
// are typed by hand in the CRM's automation builder.
function hasTag(tags: string[] | undefined | null, want: string): boolean {
  return (tags ?? []).some((t) => t.trim().toLowerCase() === want);
}

// The one stage a phone appointment lives in. Kept name-based on purpose: it
// is the cheap board-level filter that decides which leads are worth fetching
// calendar events for.
export function isPhoneApptStage(stageName: string | undefined | null): boolean {
  if (!stageName) return false;
  const s = stageName.trim().toLowerCase();
  return s.includes("phone appt") || s.includes("phone appointment");
}

// The lead confirmed: the client's Phone Appointment Confirmed automation
// stamps this tag when the appointment status flips to confirmed.
export function hasApptConfirmedTag(tags: string[] | undefined | null): boolean {
  return hasTag(tags, "phone appointment confirmed");
}

export function hasApptBookedTag(tags: string[] | undefined | null): boolean {
  return hasTag(tags, "phone appointment booked");
}

// A lead with a booking that nobody has confirmed yet: the only lead the
// manual-confirm alert is for. A lead carrying neither tag but sitting in the
// stage counts as unconfirmed too, because an absent tag is not evidence of a
// confirmation.
export function isAwaitingConfirm(
  stageName: string | undefined | null,
  tags: string[] | undefined | null,
): boolean {
  if (!isPhoneApptStage(stageName)) return false;
  return !hasApptConfirmedTag(tags);
}

// Any lead whose booked appointment should be looked up: in the appointment
// stage, or carrying either appointment tag (a lead the automation has moved
// on but whose booking the cockpit still acts against).
export function isApptTracked(
  stageName: string | undefined | null,
  tags?: string[] | null,
): boolean {
  return isPhoneApptStage(stageName) || hasApptBookedTag(tags) || hasApptConfirmedTag(tags);
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
