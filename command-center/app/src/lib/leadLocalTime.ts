// What time it is where the prospect is.
//
// A cold caller works one list all day and the list is not in one timezone. This
// answers the only question that matters before pressing dial: is it a
// reasonable hour there. Pure and injected with `now`, so it is unit-tested
// rather than trusted.
//
// Two sources, in order of trust:
//   1. The lead's own timezone field, however it was written down.
//   2. The area code of the phone number.
//
// The second is an inference and is labelled as one everywhere it is shown. Area
// codes follow states, and several states straddle a zone line, so a handful of
// numbers will be an hour out. That is worth saying out loud and still worth
// showing: "probably mid-morning there" beats no idea at all.

import { ZONE_BY_AREA_CODE, areaCodeOf } from "../../functions/lib/leadZones";

// The area-code map itself lives in functions/lib/leadZones.ts, because the
// Leads page filter reads it server-side too and two copies of it would drift.
// Re-exported so this file stays the one import a screen needs for "what time is
// it where this prospect is".
export { areaCodeOf };

export type ZoneSource = "lead" | "areaCode";

export interface LeadZone {
  zone: string; // IANA, e.g. "America/Denver"
  source: ZoneSource;
}

// The shorthand people actually type into a timezone field.
const ZONE_WORDS: Record<string, string> = {
  et: "America/New_York",
  est: "America/New_York",
  edt: "America/New_York",
  eastern: "America/New_York",
  "eastern time": "America/New_York",
  ct: "America/Chicago",
  cst: "America/Chicago",
  cdt: "America/Chicago",
  central: "America/Chicago",
  "central time": "America/Chicago",
  mt: "America/Denver",
  mst: "America/Denver",
  mdt: "America/Denver",
  mountain: "America/Denver",
  "mountain time": "America/Denver",
  arizona: "America/Phoenix",
  pt: "America/Los_Angeles",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  pacific: "America/Los_Angeles",
  "pacific time": "America/Los_Angeles",
  akst: "America/Anchorage",
  alaska: "America/Anchorage",
  hst: "Pacific/Honolulu",
  hawaii: "Pacific/Honolulu",
  atlantic: "America/Halifax",
};

function isRealZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// The lead's timezone if it holds anything usable, else the area code's. Null
// when neither says anything, in which case the UI shows no time at all rather
// than a default that would quietly mean "Eastern".
export function zoneForLead(lead: { timezone?: string; phone?: string }): LeadZone | null {
  const written = (lead.timezone ?? "").trim();
  if (written) {
    const word = ZONE_WORDS[written.toLowerCase()];
    if (word) return { zone: word, source: "lead" };
    if (written.includes("/") && isRealZone(written)) return { zone: written, source: "lead" };
  }

  const zone = ZONE_BY_AREA_CODE[areaCodeOf(lead.phone ?? "")];
  return zone ? { zone, source: "areaCode" } : null;
}

// The zones a caller can pick from, in the order a North American list reads.
//
// Every zone the area-code map can infer is here, because the picker exists to
// CORRECT that inference: a zone the app can guess but not offer would be a
// prospect nobody could put back. Arizona is listed separately from Mountain on
// purpose, since it does not move for daylight saving and is an hour out from
// Denver for most of the year, which is exactly the kind of mistake this fixes.
export const ZONE_CHOICES: { zone: string; label: string }[] = [
  { zone: "America/New_York", label: "Eastern" },
  { zone: "America/Chicago", label: "Central" },
  { zone: "America/Denver", label: "Mountain" },
  { zone: "America/Phoenix", label: "Arizona" },
  { zone: "America/Los_Angeles", label: "Pacific" },
  { zone: "America/Anchorage", label: "Alaska" },
  { zone: "Pacific/Honolulu", label: "Hawaii" },
  { zone: "America/Halifax", label: "Atlantic" },
  { zone: "America/Puerto_Rico", label: "Puerto Rico" },
  { zone: "America/Regina", label: "Saskatchewan" },
];

/** "Mountain" for a zone that is offered, the raw IANA name for one that is not. */
export function zoneLabel(zone: string): string {
  return ZONE_CHOICES.find((c) => c.zone === zone)?.label ?? zone;
}

/**
 * The zone the picker should show as chosen, or "" for "from the area code".
 *
 * "" is the absence of a value rather than a value: it means nothing has been
 * written down, so the inference stands. A lead whose timezone reads "EST" is
 * shown as Eastern, because that is what it means and a picker that could not
 * represent what is stored would rewrite it the moment anything else was saved.
 */
export function pickedZone(lead: { timezone?: string; phone?: string }): string {
  const found = zoneForLead(lead);
  return found?.source === "lead" ? found.zone : "";
}

// "3:42 PM" in that zone.
export function timeInZone(zone: string, nowMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(nowMs));
}

// The hour (0-23) in that zone.
export function hourInZone(zone: string, nowMs: number): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    hour12: false,
  }).format(new Date(nowMs));
  // Some runtimes render midnight as "24".
  return Number(hour) % 24;
}

// Outside the hours anyone should be cold-called. The default window is the
// federal telemarketing one: no earlier than 8am, no later than 9pm, local to
// the person being called.
export function isOutsideCallingHours(
  zone: string,
  nowMs: number,
  startHour = 8,
  endHour = 21,
): boolean {
  const hour = hourInZone(zone, nowMs);
  return hour < startHour || hour >= endHour;
}

// The short label under a prospect's name, e.g. "2:14 PM their time".
export function localTimeLabel(zone: string, nowMs: number): string {
  return `${timeInZone(zone, nowMs)} their time`;
}
