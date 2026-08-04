// Every business rule Jersey can change without touching logic.
//
// There is no database in this build. Her Google Calendar is the system of
// record: availability is these opening hours minus whatever Google says is
// busy, and a booking is a Google event. Change a number here and the next
// request already reflects it.

// Texas. Central time, so the whole state except the El Paso corner.
export const TIMEZONE = "America/Chicago";

// BOOKABLE START TIMES per weekday, 0 = Sunday. A day with no ranges is
// closed. Several ranges make a split shift, for example a lunch break.
//
// These bound when an appointment can START, not when it has to finish. A 3 hr
// bleach starting at the last slot simply runs past the end of the window, by
// design. What stops appointments colliding is the length plus buffer check in
// availability.ts, not this window.
export const HOURS: Record<number, [string, string][]> = {
  0: [], // Sunday, closed
  1: [["13:30", "18:00"]], // Monday
  2: [["13:30", "18:00"]], // Tuesday
  3: [["13:30", "18:00"]], // Wednesday
  4: [["13:30", "18:00"]], // Thursday
  5: [["13:30", "18:00"]], // Friday
  6: [], // Saturday, closed
};

// Start times are offered on this grid, in minutes. 30 gives :00 and :30.
export const SLOT_STEP_MINUTES = 30;

// Quiet time held either side of an appointment, for cleaning down and
// running over. It blocks the slot without appearing in the price or the
// length the client is shown.
export const BUFFER_MINUTES = 15;

// How soon someone can book. Stops a 7am booking for 8am the same morning.
export const MIN_NOTICE_HOURS = 12;

// How far ahead the calendar opens.
export const BOOKING_HORIZON_DAYS = 60;

// Dates she is closed regardless of HOURS, as YYYY-MM-DD. Holidays, holidays
// away, anything one-off. Blocking time in Google works too and is usually
// easier; this is here for dates known well in advance.
export const CLOSED_DATES: string[] = [];

// The Composio user id her Google grant is stored under. One stylist, one
// key. It never changes once she has connected, so changing it would orphan
// the connection.
export const COMPOSIO_USER_ID = "jersey-morton";

// Which of her Google calendars to read and write. "primary" is the default
// calendar on the account she connects.
export const CALENDAR_ID = "primary";
