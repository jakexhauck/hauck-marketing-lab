// Opening hours minus what Google says is busy, sliced into start times that
// a given service actually fits inside.
//
// Pure functions on purpose: no fetch, no clock of its own. The caller passes
// "now" and the busy list, which is what makes this testable and what lets the
// booking endpoint re-run the exact same check a second time before it writes.

import {
  BUFFER_MINUTES,
  CLOSED_DATES,
  HOURS,
  MIN_NOTICE_HOURS,
  SLOT_STEP_MINUTES,
  TIMEZONE,
} from "./config.ts";
import { dateInZone, dateTimeToUtc, minutesFromHHMM, timeLabelInZone, weekdayInZone } from "./time.ts";

export interface Interval {
  start: number; // epoch ms
  end: number; // epoch ms
}

export interface Slot {
  time: string; // "14:30" in her timezone
  startIso: string;
  endIso: string;
}

const MIN = 60_000;

export function overlaps(a: Interval, b: Interval): boolean {
  // Touching end to end is not an overlap: an appointment ending at 12:00 does
  // not block one starting at 12:00.
  return a.start < b.end && b.start < a.end;
}

// Merging first means an appointment sitting inside a longer block is not
// tested twice, and keeps the overlap scan honest when Google returns
// overlapping events (a common shape when she double books herself).
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

// The windows in which an appointment may START on a given date, as epochs.
// The end of a window is the last bookable start, not a closing time: an
// appointment is allowed to run past it.
export function openWindows(dateISO: string, tz = TIMEZONE): Interval[] {
  if (CLOSED_DATES.includes(dateISO)) return [];
  const noon = dateTimeToUtc(dateISO, "12:00", tz);
  const ranges = HOURS[weekdayInZone(noon, tz)] ?? [];
  return ranges
    .map(([from, to]) => ({
      start: dateTimeToUtc(dateISO, from, tz),
      end: dateTimeToUtc(dateISO, to, tz),
    }))
    .filter((w) => w.end > w.start);
}

export interface SlotOptions {
  dateISO: string;
  minutes: number;
  busy: Interval[];
  nowMs: number;
  tz?: string;
}

// Start times inside one of the day's windows where nothing, including the
// buffer either side, collides with a busy block.
//
// The appointment is NOT required to finish inside the window. A 3 hr service
// booked at the last slot runs past it, which is what she asked for. Two
// appointments still cannot overlap, because the guarded interval below spans
// the real length.
export function slotsForDate(opts: SlotOptions): Slot[] {
  const tz = opts.tz ?? TIMEZONE;
  const busy = mergeIntervals(opts.busy);
  const earliest = opts.nowMs + MIN_NOTICE_HOURS * 60 * MIN;
  const step = SLOT_STEP_MINUTES * MIN;
  const length = opts.minutes * MIN;
  const buffer = BUFFER_MINUTES * MIN;
  const out: Slot[] = [];

  for (const window of openWindows(opts.dateISO, tz)) {
    // Align the first candidate to the grid measured from the window's own
    // opening time, so a 13:30 open gives 13:30 and 14:00, never 13:45. The
    // last start is the window's end itself, inclusive.
    for (let start = window.start; start <= window.end; start += step) {
      if (start < earliest) continue;

      const guarded: Interval = { start: start - buffer, end: start + length + buffer };
      if (busy.some((b) => overlaps(guarded, b))) continue;

      out.push({
        time: timeLabelInZone(start, tz),
        startIso: new Date(start).toISOString(),
        endIso: new Date(start + length).toISOString(),
      });
    }
  }

  return out;
}

// The check the booking endpoint runs against freshly fetched busy time.
// Someone can take the slot in the seconds between seeing it and pressing
// confirm, and Google is the only thing that knows.
//
// Deliberately rebuilds the day's slots rather than re-testing the overlap on
// its own: opening hours, closed dates, notice and buffer are then enforced by
// exactly the same code that offered the slot, so the two can never disagree.
export function isStillFree(
  startIso: string,
  minutes: number,
  busy: Interval[],
  nowMs: number,
  tz = TIMEZONE,
): boolean {
  const start = Date.parse(startIso);
  if (Number.isNaN(start)) return false;

  const slots = slotsForDate({
    dateISO: dateInZone(start, tz),
    minutes,
    busy,
    nowMs,
    tz,
  });
  return slots.some((s) => Date.parse(s.startIso) === start);
}

export function minutesToLabel(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return `${h} hr${r ? ` ${r} min` : ""}`;
}

export { minutesFromHHMM };
