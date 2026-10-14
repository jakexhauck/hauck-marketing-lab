import { isColdCallCalendar } from "./coldCallCalendar";
import { dateStringInZone } from "./tz";
import type { RecordedCounts } from "./coldCallDials";

// Meetings booked, counted off the calendar rather than off a button.
//
// Since 2026-10-01 meetings are booked inside GoHighLevel, so the "booked" dial
// stopped being the record of a meeting: a booking made from a contact record,
// a link or a reschedule never pressed it. The Cold Call calendar is the record
// now. A day's meetings are the appointments on "Hauck Marketing Demo Call -
// Cold Call" that were BOOKED that day (when the row first appeared), not the
// day the meeting takes place.
//
// From the cutoff only. Earlier months were counted off the button and stay as
// they were, so no past day changes its number under anybody.
export const MEETINGS_FROM_CALENDAR = "2026-10-01";

// One sales_calls row, as much of it as the count needs.
export interface CalendarMeetingRow {
  createdAt: string;
  calendarName: string | null;
  excludedAt: string | null;
  loggedBy: string | null;
  leadId: string | null;
}

export interface CreditedMeeting {
  // "" when nobody can be named; the agency total still counts it.
  callerId: string;
  day: string;
}

// Which caller and which day each meeting belongs to.
//
// The caller is whoever last dialled that prospect, which for a meeting booked
// in GoHighLevel straight after a call is the person who made the call. Then
// whoever logged the row. booked_by (0136) is not read: only the in-app
// booking panel sets it, and meetings are booked in GoHighLevel now.
export function creditMeetings(
  rows: CalendarMeetingRow[],
  lastCallerByLead: Map<string, string>,
  zone: string,
  from = MEETINGS_FROM_CALENDAR,
): CreditedMeeting[] {
  const out: CreditedMeeting[] = [];
  for (const row of rows) {
    if (row.excludedAt) continue;
    if (!isColdCallCalendar(row.calendarName)) continue;
    const ms = Date.parse(row.createdAt);
    if (!Number.isFinite(ms)) continue;
    const day = dateStringInZone(zone, ms);
    if (day < from) continue;
    const callerId = (row.leadId ? lastCallerByLead.get(row.leadId) : undefined) || row.loggedBy || "";
    out.push({ callerId, day });
  }
  return out;
}

// Put the meetings onto the recorded days. A day with a meeting and no dials
// still appears: booking off a callback the next morning is a worked day.
export function addCalendarMeetings(
  recorded: Record<string, RecordedCounts>,
  days: string[],
): Record<string, RecordedCounts> {
  for (const day of days) {
    const counts = (recorded[day] ??= {
      callsMade: 0,
      pickups: 0,
      passThrough: 0,
      meetingsBooked: 0,
      reasons: {},
    });
    counts.meetingsBooked += 1;
  }
  return recorded;
}
