// Timezone arithmetic with no dependencies, because Workers ship Intl and a
// date library is not worth the bundle.
//
// Everything downstream compares epoch milliseconds. Wall-clock time only
// exists at the two edges: reading her opening hours, and labelling a slot for
// the client. Doing the maths in UTC is what keeps a 3 hr appointment three
// hours long across a daylight-saving change.

// What "now" reads as inside a timezone, as calendar parts.
function partsIn(utcMs: number, tz: string): Record<string, number> {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(new Date(utcMs))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  // Intl renders midnight as hour 24 in some engines.
  if (out.hour === 24) out.hour = 0;
  return out;
}

// How far the zone is from UTC at a given instant, in ms. Positive east.
export function offsetMs(utcMs: number, tz: string): number {
  const p = partsIn(utcMs, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utcMs;
}

// A wall-clock time in a zone, as an epoch. Two passes: the first offset is
// read at the wrong instant on a DST day, and re-reading at the corrected
// instant lands on the right side of the jump.
export function zonedToUtc(
  y: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): number {
  const naive = Date.UTC(y, month - 1, day, hour, minute);
  let utc = naive - offsetMs(naive, tz);
  utc = naive - offsetMs(utc, tz);
  return utc;
}

// "2026-08-11" plus "14:30" in a zone, as an epoch.
export function dateTimeToUtc(dateISO: string, hhmm: string, tz: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return zonedToUtc(y, m, d, hh, mm, tz);
}

// The calendar date an instant falls on inside a zone, as YYYY-MM-DD.
export function dateInZone(utcMs: number, tz: string): string {
  const p = partsIn(utcMs, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// 0 = Sunday, matching config.HOURS.
export function weekdayInZone(utcMs: number, tz: string): number {
  const p = partsIn(utcMs, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

// "14:30" for an instant, inside a zone.
export function timeLabelInZone(utcMs: number, tz: string): string {
  const p = partsIn(utcMs, tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function minutesFromHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Walks calendar dates, not 24-hour blocks, so a DST day is still one day.
export function addDays(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function isValidDate(dateISO: unknown): dateISO is string {
  if (typeof dateISO !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return false;
  const [y, m, d] = dateISO.split("-").map(Number);
  const back = new Date(Date.UTC(y, m - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
}
