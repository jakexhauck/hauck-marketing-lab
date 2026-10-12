// Time maths for the Cold SMS booking wizard.
//
// The week is drawn in the AGENCY's zone (Jake's), whatever zone the browser is
// in, and every open slot also says what time that is for the prospect. Pure and
// Intl-only, so it is tested without a clock or a network.

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(ms: number, zone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: WEEKDAY[get("weekday")] ?? 0,
  };
}

// The instant a wall-clock time happens in a zone. Two passes settle the offset
// even on a daylight-saving changeover day.
export function zonedTimeToMs(
  zone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let ms = wall;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(ms, zone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    ms += wall - asUtc;
  }
  return ms;
}

export interface WeekDay {
  key: string; // YYYY-MM-DD in the zone
  start: number; // midnight in the zone, epoch ms
  weekday: number;
  date: number;
  month: number;
  year: number;
}

// Monday to Sunday of the week `offset` weeks from the one containing `now`.
export function weekOf(now: number, zone: string, offset = 0): WeekDay[] {
  const p = zonedParts(now, zone);
  const back = (p.weekday + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - back + offset * 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    return {
      key: `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      start: zonedTimeToMs(zone, y, m, day),
      weekday: d.getUTCDay(),
      date: day,
      month: m,
      year: y,
    };
  });
}

export function dayKeyOf(ms: number, zone: string): string {
  const p = zonedParts(ms, zone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// Hours since midnight in the zone, as a decimal (2:30 PM -> 14.5).
export function hourOf(ms: number, zone: string): number {
  const p = zonedParts(ms, zone);
  return p.hour + p.minute / 60;
}

export function formatTime(ms: number, zone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
}

export function formatDay(ms: number, zone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric" }).format(
    new Date(ms),
  );
}

// "ET", "CT", "MT", "PT" for the US zones (no daylight/standard letter, which
// people read as noise); whatever Intl says for anything else.
export function zoneShort(zone: string, ms = Date.now()): string {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
      .formatToParts(new Date(ms))
      .find((p) => p.type === "timeZoneName")?.value ?? zone;
  const us = /^([ECMPAH])[SD]T$/.exec(name);
  return us ? `${us[1]}T` : name;
}

// Before 8am or after 7pm where the prospect is: still bookable, drawn faded.
export function isOffHours(ms: number, zone: string): boolean {
  const h = hourOf(ms, zone);
  return h < 8 || h >= 19;
}

// The zones the wizard's "their zone" picker offers.
export const PROSPECT_ZONES: { zone: string; label: string }[] = [
  { zone: "America/New_York", label: "Eastern" },
  { zone: "America/Chicago", label: "Central" },
  { zone: "America/Denver", label: "Mountain" },
  { zone: "America/Phoenix", label: "Arizona" },
  { zone: "America/Los_Angeles", label: "Pacific" },
  { zone: "America/Anchorage", label: "Alaska" },
  { zone: "Pacific/Honolulu", label: "Hawaii" },
];
