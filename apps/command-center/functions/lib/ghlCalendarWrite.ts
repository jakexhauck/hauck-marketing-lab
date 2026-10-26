import { ghlJson, type GhlContext } from "./ghl";
import type { GhlOpenHours } from "./calendarHours";

// Writing a client's opening hours back into GoHighLevel.
//
// THE ONE THING THAT MATTERS HERE, proved against the live API on 2026-08-13:
// a PUT carrying only openHours silently RESETS the settings it was not told
// about. Sending { openHours } to a calendar with 15 minute slots came back
// with 30 minute slots, a 30 minute interval, and buffers that had not existed
// before. Nothing errors, nothing warns, and the next customer books a slot
// twice the length the client sells.
//
// So every write is read-modify-write: fetch the calendar, carry its own
// settings back with the new hours. A full echo of the record is NOT the
// answer either, and was tried: GHL rejects it 422 because some fields it
// returns are not writable (formSubmitRedirectUrl) and teamMembers may not be
// sent empty.

/**
 * The settings carried back on every hours write.
 *
 * Anything a client's booking behaviour depends on that GHL will default away
 * if omitted. Names are GHL's own, misspelling included: "appoinmentPerSlot" is
 * how the API spells it, and the correctly spelled twin it also returns is a
 * read-only alias.
 */
export const PRESERVED_FIELDS = [
  "slotDuration",
  "slotDurationUnit",
  "slotInterval",
  "slotIntervalUnit",
  "slotBuffer",
  "slotBufferUnit",
  "preBuffer",
  "preBufferUnit",
  "appoinmentPerSlot",
  "appoinmentPerDay",
  "allowBookingAfter",
  "allowBookingAfterUnit",
  "allowBookingFor",
  "allowBookingForUnit",
] as const;

export type CalendarRecord = Record<string, unknown>;

// GHL reads these as minutes whatever their unit says: a 1 hour interval
// written back as { 1, "hours" } came back as 0.02 hours (Made Better's unused
// Home Estimate copy, 2026-10-26). So one held in hours goes back as minutes,
// which is right whichever way GHL reads it. Booking notice and range kept
// their own units in the same write.
const MINUTE_FIELDS = ["slotDuration", "slotInterval", "slotBuffer", "preBuffer"] as const;

/**
 * What every calendar write carries back so GHL cannot default it away: the
 * slot and booking settings, the availability type (dropped when left out),
 * and what the booking form does after a submit (reset to the thank-you
 * message when left out; a redirect is refused 422 without its URL, so one
 * with no URL is not sent).
 */
export function carriedSettings(current: CalendarRecord): CalendarRecord {
  const body: CalendarRecord = {};
  for (const key of PRESERVED_FIELDS) {
    if (current[key] !== undefined && current[key] !== null && current[key] !== "") body[key] = current[key];
  }
  for (const key of MINUTE_FIELDS) {
    const unit = `${key}Unit`;
    if (typeof body[key] === "number" && body[unit] === "hours") {
      body[key] = Math.round((body[key] as number) * 60);
      body[unit] = "mins";
    }
  }
  if (current.availabilityType === 0 || current.availabilityType === 1) body.availabilityType = current.availabilityType;
  const redirect = String(current.formSubmitRedirectURL ?? current.formSubmitRedirectUrl ?? "").trim();
  if (current.formSubmitType === "ThankYouMessage") body.formSubmitType = "ThankYouMessage";
  if (current.formSubmitType === "RedirectURL" && redirect) {
    body.formSubmitType = "RedirectURL";
    body.formSubmitRedirectURL = redirect;
  }
  return body;
}

/**
 * The body for an hours update: the new hours, plus whatever the calendar
 * already said (carriedSettings).
 *
 * Pure, and exported for tests, because the failure it prevents is silent: a
 * body that drops one of these looks like it worked.
 */
export function buildHoursUpdate(
  current: CalendarRecord,
  openHours: GhlOpenHours[],
): CalendarRecord {
  return { ...carriedSettings(current), openHours };
}

/** Read one calendar. GHL wraps it in { calendar: ... }; older shapes do not. */
export async function readCalendar(
  ctx: GhlContext,
  calendarId: string,
): Promise<CalendarRecord> {
  const data = await ghlJson<{ calendar?: CalendarRecord }>(
    ctx,
    `/calendars/${encodeURIComponent(calendarId)}`,
  );
  return (data?.calendar ?? (data as CalendarRecord)) ?? {};
}

/** Write new opening hours, preserving everything else the calendar carries. */
export async function writeOpenHours(
  ctx: GhlContext,
  calendarId: string,
  openHours: GhlOpenHours[],
): Promise<CalendarRecord> {
  const current = await readCalendar(ctx, calendarId);
  const data = await ghlJson<{ calendar?: CalendarRecord }>(
    ctx,
    `/calendars/${encodeURIComponent(calendarId)}`,
    { method: "PUT", body: JSON.stringify(buildHoursUpdate(current, openHours)) },
  );
  return (data?.calendar ?? (data as CalendarRecord)) ?? {};
}
