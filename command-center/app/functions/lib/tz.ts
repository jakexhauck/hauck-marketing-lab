// Tenant-timezone date math via Intl.DateTimeFormat, no date libraries.
// "Today" for a business in Chicago is not UTC's today; every backend
// day-boundary computation goes through these helpers.

function partsInZone(zone: string, utcMs: number): Record<string, string> {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const out: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) out[p.type] = p.value;
  return out;
}

// Offset (ms) of the zone from UTC at the given instant.
function zoneOffsetMs(zone: string, utcMs: number): number {
  const p = partsInZone(zone, utcMs);
  const hour = p.hour === "24" ? 0 : Number(p.hour);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    hour,
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - utcMs;
}

// Calendar date (YYYY-MM-DD) of an instant, in the zone.
export function dateStringInZone(zone: string, utcMs: number): string {
  const p = partsInZone(zone, utcMs);
  return `${p.year}-${p.month}-${p.day}`;
}

// Epoch ms of midnight today in the zone. Two-pass offset correction handles
// DST transitions that land on midnight.
export function startOfTodayMs(zone: string, nowMs = Date.now()): number {
  const p = partsInZone(zone, nowMs);
  const midnightAsUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
  );
  let guess = midnightAsUtc - zoneOffsetMs(zone, nowMs);
  guess = midnightAsUtc - zoneOffsetMs(zone, guess);
  return guess;
}

// Epoch ms of midnight N days from today in the zone (N may be negative).
export function startOfDayOffsetMs(
  zone: string,
  days: number,
  nowMs = Date.now(),
): number {
  return startOfTodayMs(zone, nowMs + days * 86_400_000);
}
