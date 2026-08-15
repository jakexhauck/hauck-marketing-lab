import { buildMonthDays, type MonthCursor, type TodayRef } from "./trackerMonth";
import { ZONE_CHOICES, zoneLabel } from "./leadLocalTime";

// The month grid behind the booking calendar: the same shape GoHighLevel's own
// booking page uses, so a caller looking at it recognises it.
//
// Pure. The availability comes from the calendar's live free slots and is passed
// in as a set of dates; this file only decides where each day sits in the grid
// and whether it can be clicked.

export interface CalendarCell {
  // null for the padding cells before the 1st and after the last.
  iso: string | null;
  day: number | null;
  // The calendar offered at least one free time on this day.
  hasSlots: boolean;
  isToday: boolean;
  // Before today. Rendered dead: a past day can never take a booking.
  isPast: boolean;
}

const EMPTY: CalendarCell = {
  iso: null,
  day: null,
  hasSlots: false,
  isToday: false,
  isPast: false,
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function isoOf(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

// Weeks of seven cells, Sunday first, padded at both ends so the grid is
// rectangular and the weekday headers line up.
export function buildBookingWeeks(
  cursor: MonthCursor,
  today: TodayRef,
  availableDates: Set<string>,
): CalendarCell[][] {
  const todayIso = isoOf(today.year, today.month, today.day);

  const cells: CalendarCell[] = buildMonthDays(cursor, today).map((d) => ({
    iso: d.iso,
    day: d.day,
    hasSlots: availableDates.has(d.iso),
    isToday: d.iso === todayIso,
    // String compare is safe on ISO dates and avoids a timezone round trip.
    isPast: d.iso < todayIso,
  }));

  const lead = new Date(cursor.year, cursor.month, 1).getDay();
  const padded: CalendarCell[] = [...Array<CalendarCell>(lead).fill(EMPTY), ...cells];
  while (padded.length % 7 !== 0) padded.push(EMPTY);

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));
  return weeks;
}

// The month a date sits in, or null if the date is unusable. Used to open the
// grid on the first day that has times rather than on today, which may be
// fully booked.
export function cursorForIso(iso: string | null | undefined): MonthCursor | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1 };
}

export function firstAvailableIso(
  days: { date: string; slots: string[] }[] | null | undefined,
): string | null {
  return days?.find((d) => d.slots.length > 0)?.date ?? null;
}

// ---------------------------------------------------------------------------
// Reading the same slots in a different timezone
// ---------------------------------------------------------------------------
//
// A slot is an instant: "2026-07-26T14:30:00-04:00" is one moment whichever
// clock reads it. What changes with the zone is the DAY and the TIME a person
// sees, and both have to change together. Showing 11:30 AM Pacific under a day
// heading the Eastern calendar decided is how a caller books Tuesday while
// saying Monday out loud.
//
// So the grouping is rebuilt here rather than trusted from the server, which
// grouped by the agency's own zone.

export interface SlotDay {
  date: string;
  slots: string[];
}

// Is this a timezone this runtime knows? A picker fed an unknown zone would
// throw inside a formatter on every render.
export function isKnownZone(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// Built through formatToParts rather than a locale that happens to print
// year-first, so the key is the same string on every machine.
export function dayKeyInZone(slot: string, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(slot));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function timeLabelInZone(slot: string, zone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(slot));
}

// The same slots, filed under the day each one falls on in `zone`, sorted so
// the grid and the time column read in order. An unknown zone returns the days
// untouched: the caller keeps a working calendar rather than an empty one.
export function regroupDaysInZone(days: SlotDay[], zone: string): SlotDay[] {
  if (!isKnownZone(zone)) return days;

  const byDate = new Map<string, string[]>();
  for (const d of days) {
    for (const slot of d.slots) {
      const key = dayKeyInZone(slot, zone);
      const list = byDate.get(key);
      if (list) list.push(slot);
      else byDate.set(key, [slot]);
    }
  }

  return [...byDate.entries()]
    .map(([date, slots]) => ({
      date,
      slots: slots.sort((a, b) => +new Date(a) - +new Date(b)),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface ZoneOption {
  zone: string;
  label: string;
}

// What the booking panel's timezone control offers.
//
// The same list the call card corrects a prospect's zone with, plus a note on
// the two entries that mean something: the agency's own clock, which the
// calendar's free times were computed against, and the prospect's, which is the
// one being read down the phone. Marking them is the whole point of the
// control: "Pacific" alone does not tell a caller whose Pacific it is.
//
// An agency zone the list does not carry (the env var can hold any IANA name)
// is added at the top rather than silently dropped, or the default itself would
// be unselectable.
export function bookingZoneOptions(
  agencyZone: string,
  prospectZone: string | null,
): ZoneOption[] {
  const base = ZONE_CHOICES.map((c) => ({ zone: c.zone, label: c.label }));
  if (agencyZone && !base.some((o) => o.zone === agencyZone)) {
    base.unshift({ zone: agencyZone, label: zoneLabel(agencyZone) });
  }

  return base.map((o) => {
    const mine = o.zone === agencyZone;
    const theirs = Boolean(prospectZone) && o.zone === prospectZone;
    if (mine && theirs) return { ...o, label: `${o.label} (yours and theirs)` };
    if (mine) return { ...o, label: `${o.label} (yours)` };
    if (theirs) return { ...o, label: `${o.label} (theirs)` };
    return o;
  });
}
