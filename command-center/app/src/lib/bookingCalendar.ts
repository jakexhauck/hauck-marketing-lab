import { buildMonthDays, type MonthCursor, type TodayRef } from "./trackerMonth";

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
