// Checked rather than trusted because it is written onto a real person's CRM
// record and every reminder they get is rendered against it. A junk value would
// not error anywhere: GoHighLevel would take it, and the fallback it silently
// used instead would be the location's zone, which is the bug this fixes.
export function cleanBookingZone(value: unknown): string | null {
  const zone = typeof value === "string" ? value.trim() : "";
  if (!zone) return null;
  // A region/city name, and nothing else. Intl ALSO accepts the old
  // abbreviations, and they are a trap worth naming: in the IANA database "PST"
  // is a fixed UTC-8 with no daylight saving, so from March to November a
  // contact filed under it is told an hour that is sixty minutes out. Same for
  // EST. The picker only ever produces America/..., so requiring the slash costs
  // nothing and closes the one shape of this bug that would look like a fix.
  if (!zone.includes("/")) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}
