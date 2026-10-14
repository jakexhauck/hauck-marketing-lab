// Turning GoHighLevel's openHours into one line an operator can read.
//
// GHL stores availability as one entry per group of days, each carrying its own
// list of open ranges:
//
//   [{ daysOfTheWeek: [1], hours: [{ openHour: 11, openMinute: 0, ... }] }, ...]
//
// Five identical weekday entries is the normal shape, which reads as forty
// lines of JSON and means "weekdays, 11 to 6". This collapses it, so the
// Calendars page can show what a customer can actually book without anybody
// opening GHL to check.

export interface GhlOpenRange {
  openHour?: number;
  openMinute?: number;
  closeHour?: number;
  closeMinute?: number;
}

export interface GhlOpenHours {
  daysOfTheWeek?: number[];
  hours?: GhlOpenRange[];
}

// GHL does not always send a list.
//
// Willis's "Window Cleaning Service" calendar returns `openHours: {}`, an empty
// OBJECT, where every other calendar on the same sub-account returns an array.
// A calendar that has never had hours set appears to come back this way, and it
// took a 500 on a live page to find out. Every reader below goes through this.
function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

// GHL numbers days 0..6 from Sunday, matching JavaScript's getDay().
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ---------------------------------------------------------------------------
// The editor's shape
// ---------------------------------------------------------------------------

/** One day of the week, with the times it is open. Empty ranges means closed. */
export interface DayHours {
  day: number;
  ranges: { open: string; close: string }[];
}

function hhmm(hour?: number, minute?: number): string {
  return clock(hour, minute);
}

/** Parse "09:30" into GHL's four numbers. Returns null on anything else. */
export function parseClock(value: unknown): { hour: number; minute: number } | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * GHL's grouped openHours, exploded into one entry per weekday.
 *
 * The editor works a day at a time because that is how anybody thinks about
 * opening hours. GHL's own grouping (one entry per set of days sharing times)
 * is regrouped on the way back out.
 */
export function toDayHours(openHours: GhlOpenHours[] | undefined | null): DayHours[] {
  const byDay = new Map<number, { open: string; close: string }[]>();
  for (let d = 0; d < 7; d += 1) byDay.set(d, []);

  for (const entry of asList<GhlOpenHours>(openHours)) {
    const ranges = asList<GhlOpenRange>(entry?.hours)
      .filter((h) => h && typeof h === "object")
      .map((h) => ({
        open: hhmm(h.openHour, h.openMinute),
        close: hhmm(h.closeHour, h.closeMinute),
      }));
    if (ranges.length === 0) continue;
    for (const day of asList<number>(entry?.daysOfTheWeek)) {
      if (day < 0 || day > 6) continue;
      byDay.get(day)!.push(...ranges);
    }
  }

  return [...byDay.entries()].map(([day, ranges]) => ({ day, ranges }));
}

/**
 * Back to GHL's shape: days sharing identical times are grouped into one entry,
 * which is what GHL's own UI writes and therefore what reads back cleanly.
 *
 * Returns null when anything is malformed, so a bad payload is refused rather
 * than written as a calendar nobody can book.
 */
export function toOpenHours(days: DayHours[]): GhlOpenHours[] | null {
  const groups = new Map<string, { days: number[]; hours: GhlOpenRange[] }>();

  for (const entry of days) {
    const day = entry?.day;
    if (typeof day !== "number" || day < 0 || day > 6) return null;
    const ranges = asList<{ open: string; close: string }>(entry?.ranges);
    if (ranges.length === 0) continue;

    const hours: GhlOpenRange[] = [];
    for (const r of ranges) {
      const open = parseClock(r?.open);
      const close = parseClock(r?.close);
      if (!open || !close) return null;
      // A close at or before its open is a day nobody can book, and GHL accepts
      // it silently. Refused here rather than written.
      if (close.hour * 60 + close.minute <= open.hour * 60 + open.minute) return null;
      hours.push({
        openHour: open.hour,
        openMinute: open.minute,
        closeHour: close.hour,
        closeMinute: close.minute,
      });
    }

    const key = JSON.stringify(hours);
    const group = groups.get(key) ?? { days: [], hours };
    group.days.push(day);
    groups.set(key, group);
  }

  return [...groups.values()].map((g) => ({
    daysOfTheWeek: [...new Set(g.days)].sort((a, b) => a - b),
    hours: g.hours,
  }));
}

function clock(hour?: number, minute?: number): string {
  const h = Number.isFinite(hour) ? (hour as number) : 0;
  const m = Number.isFinite(minute) ? (minute as number) : 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function rangeText(hours: GhlOpenRange[]): string {
  return hours
    .map((h) => `${clock(h.openHour, h.openMinute)} to ${clock(h.closeHour, h.closeMinute)}`)
    .join(", ");
}

// Consecutive days sharing the same hours become "Mon to Fri". A gap starts a
// new run, so "Mon, Wed to Fri" stays honest rather than rounding up to a week.
function daysText(days: number[]): string {
  const sorted = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const runs: number[][] = [];
  for (const day of sorted) {
    const last = runs[runs.length - 1];
    if (last && day === last[last.length - 1] + 1) last.push(day);
    else runs.push([day]);
  }
  return runs
    .map((run) =>
      run.length === 1
        ? DAY_NAMES[run[0]]
        : run.length === 2
          ? `${DAY_NAMES[run[0]]}, ${DAY_NAMES[run[1]]}`
          : `${DAY_NAMES[run[0]]} to ${DAY_NAMES[run[run.length - 1]]}`,
    )
    .join(", ");
}

/**
 * One line per distinct set of hours, e.g. ["Mon to Fri, 11:00 to 18:00"].
 *
 * An empty result means the calendar has no open hours at all, which is a real
 * state in GHL and reads as "nothing bookable" rather than as an error.
 */
export function summariseOpenHours(openHours: GhlOpenHours[] | undefined | null): string[] {
  const groups = new Map<string, number[]>();

  for (const entry of asList<GhlOpenHours>(openHours)) {
    const hours = asList<GhlOpenRange>(entry?.hours).filter((h) => h && typeof h === "object");
    if (hours.length === 0) continue;
    const key = rangeText(hours);
    const days = groups.get(key) ?? [];
    days.push(...asList<number>(entry?.daysOfTheWeek));
    groups.set(key, days);
  }

  return [...groups.entries()]
    .map(([hours, days]) => {
      const label = daysText(days);
      return label ? `${label}, ${hours}` : hours;
    })
    .filter(Boolean);
}
