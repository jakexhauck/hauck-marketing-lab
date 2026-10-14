// The one calendar a cold call books into.
//
// Hauck Marketing runs three: Onboarding, "Hauck Marketing Demo Call", and
// "Hauck Marketing Demo Call - Cold Call". Only the last is the caller's, and
// until now the booking panel offered all three and merely DEFAULTED to a demo
// one. A default is a suggestion, and a suggestion is how a cold call ends up on
// the onboarding calendar.
//
// Matched by name rather than pinned by id, the same way salesCallSync.ts picks
// the sales calendars. An id would be exact right up until the calendar is
// rebuilt in GoHighLevel, at which point booking breaks and only a deploy fixes
// it. A name Jake controls from inside GHL is the softer failure.
//
// Deliberately NOT the sync's test. Sync reads /demo|discovery|sales/i and so
// keeps adopting every demo onto Sales > Sales Calls, which is Jake's view of
// the whole calendar. This narrower test is only about where the app WRITES, and
// about which meetings Cold Call > Booked claims as its own.

export const COLD_CALL_CALENDAR = /cold\s*call/i;

export interface NamedCalendar {
  id: string;
  // Optional because GoHighLevel's calendar list sometimes is. A nameless
  // calendar fails the test, which is the safe direction: nothing gets booked
  // onto a calendar nobody can identify.
  name?: string;
}

export function pickColdCallCalendars<T extends NamedCalendar>(calendars: T[]): T[] {
  return calendars.filter((c) => isColdCallCalendar(c.name));
}

// Whether a meeting already on the books belongs to Cold Call. Reads the name
// stored on the row at booking time (0066) rather than asking GoHighLevel,
// because the answer has to hold for a meeting whose calendar has since been
// deleted.
export function isColdCallCalendar(name: string | null | undefined): boolean {
  return COLD_CALL_CALENDAR.test(name ?? "");
}
