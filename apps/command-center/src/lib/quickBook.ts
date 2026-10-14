// Pure pieces of Quick Book (/admin/book): the phone screen Jake books a
// caller from. Kept out of the component so each rule is tested on its own.

export interface QuickBookDraft {
  tenantId: string;
  calendarId: string;
  // Empty for a new prospect. Set when an existing GHL contact was picked.
  contactId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  // The picked slot's ISO start, offset included.
  slot: string;
}

export const STEPS = ["Who", "When", "Details", "Confirm"] as const;

// The calendar to open on: the one last used for this client if it still
// exists, else the estimate calendar (the one the Google busy sync protects),
// else whatever is first.
export function defaultCalendarId(
  calendars: { id: string; name: string }[],
  remembered: string | null,
): string {
  if (remembered && calendars.some((c) => c.id === remembered)) return remembered;
  const estimate = calendars.find((c) => c.name.toLowerCase().includes("estimate"));
  return estimate?.id ?? calendars[0]?.id ?? "";
}

export function splitName(name: string): { firstName: string; lastName: string } {
  const t = name.trim();
  const i = t.indexOf(" ");
  if (i < 0) return { firstName: t, lastName: "" };
  return { firstName: t.slice(0, i), lastName: t.slice(i + 1).trim() };
}

// GHL matches contacts by phone, so a typed "(512) 555-0143" and a stored
// "+15125550143" must end up the same string or upsert makes a duplicate.
export function toE164(raw: string): string {
  const t = raw.trim();
  const digits = t.replace(/\D/g, "");
  if (t.startsWith("+") && digits.length >= 8) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return t;
}

// A slot's wall clock in the CLIENT's zone. Jake's phone may sit in a
// different zone from the client, and the caller is told the client's time.
export function slotTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

// GHL groups free slots under "YYYY-MM-DD" already in the client's zone, so the
// date is read as a plain calendar day. Noon UTC keeps it from sliding a day in
// any zone.
export function dayChip(date: string): { dow: string; day: string; month: string } {
  const d = new Date(`${date}T12:00:00Z`);
  const f = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(d);
  return { dow: f({ weekday: "short" }), day: f({ day: "numeric" }), month: f({ month: "short" }) };
}

// The full "Tue 23 Sep, 10:00 AM" line for Confirm and Booked.
export function slotLong(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(d);
  return `${date}, ${slotTime(iso, timeZone)}`;
}

// A short zone name ("EDT") for beside the times.
export function zoneAbbr(timeZone: string, at = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}

export function canAdvance(step: number, d: QuickBookDraft): boolean {
  if (step === 0) {
    if (!d.tenantId || !d.calendarId) return false;
    if (d.contactId) return true;
    return !!d.firstName.trim() && !!d.phone.trim();
  }
  if (step === 1) return !!d.slot;
  return true;
}
