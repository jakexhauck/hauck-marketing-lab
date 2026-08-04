// Google Calendar semantics on top of the Composio transport.
//
// Her calendar is the system of record for this build. There is no database:
// busy time is read from Google, and a booking is a Google event. That means
// anything she blocks out in her own calendar closes the slot automatically,
// with no second place to keep in sync.

import { CALENDAR_ID, COMPOSIO_USER_ID, TIMEZONE } from "./config.ts";
import type { Interval } from "./availability.ts";
import { type Env, listConnectedAccounts, proxyCall } from "./composio.ts";

// Composio's status enum has seven values. Only ACTIVE can execute.
const ACTIVE = "ACTIVE";

export async function connectedAccountId(env: Env): Promise<string | null> {
  try {
    const accounts = await listConnectedAccounts(env, COMPOSIO_USER_ID);
    return accounts.find((a) => a.status === ACTIVE)?.id ?? null;
  } catch {
    return null;
  }
}

// Exported for tests. Google returns ISO strings; anything unparseable is
// dropped rather than becoming an Invalid Date that silently frees a slot.
export function parseBusy(raw: unknown): Interval[] {
  const cals = (raw as { calendars?: Record<string, { busy?: unknown }> } | null)?.calendars;
  if (!cals) return [];
  const out: Interval[] = [];
  for (const entry of Object.values(cals)) {
    const list = Array.isArray(entry?.busy) ? entry.busy : [];
    for (const b of list as { start?: string; end?: string }[]) {
      const start = Date.parse(b?.start ?? "");
      const end = Date.parse(b?.end ?? "");
      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
      out.push({ start, end });
    }
  }
  return out;
}

// Busy time between two instants.
//
// This one DOES throw. Everywhere else a missing calendar is a normal state,
// but here an unreadable calendar means "we do not know what is booked", and
// offering slots on that basis is how two clients end up in the chair at once.
// The caller turns it into a 503 rather than an empty day.
export async function getBusy(env: Env, accountId: string, fromIso: string, toIso: string): Promise<Interval[]> {
  const raw = await proxyCall<unknown>(env, {
    connectedAccountId: accountId,
    endpoint: "/freeBusy",
    method: "POST",
    body: {
      timeMin: fromIso,
      timeMax: toIso,
      timeZone: "UTC",
      items: [{ id: CALENDAR_ID }],
    },
  });
  return parseBusy(raw);
}

// A day off, as an all-day busy event on her PRIMARY calendar.
//
// Deliberately not on the Booking hours calendar. Availability is open windows
// minus busy, and busy is read from primary, so a closure written here is
// subtracted by the code path that already works. Blocking the day by hand in
// Google does exactly the same thing, which is why closing a day needed no new
// concept.
export async function closeDay(env: Env, accountId: string, dateISO: string, reason: string): Promise<void> {
  const [y, m, d] = dateISO.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const end = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;

  await proxyCall(env, {
    connectedAccountId: accountId,
    endpoint: `/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
    method: "POST",
    body: {
      summary: reason || "Closed",
      start: { date: dateISO },
      end: { date: end },
      // The whole point: it has to read as busy or it closes nothing.
      transparency: "opaque",
      extendedProperties: { private: { jmKind: "closure", jmDate: dateISO } },
    },
  });
}

export interface Closure {
  date: string;
  reason: string;
  eventId: string;
}

export async function listClosures(env: Env, accountId: string): Promise<Closure[]> {
  const qs = new URLSearchParams({ privateExtendedProperty: "jmKind=closure", maxResults: "100" });
  const res = await proxyCall<{ items?: { id?: string; summary?: string; extendedProperties?: { private?: Record<string, string> } }[] }>(env, {
    connectedAccountId: accountId,
    endpoint: `/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${qs}`,
    method: "GET",
  });
  const out: Closure[] = [];
  for (const e of res?.items ?? []) {
    const date = e.extendedProperties?.private?.jmDate;
    if (!date || !e.id) continue;
    out.push({ date, reason: e.summary ?? "Closed", eventId: e.id });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Only removes closures this page created. Anything she blocked out herself is
// hers, and a page that deletes appointments it did not make is a page nobody
// should trust with a calendar.
export async function reopenDay(env: Env, accountId: string, eventId: string): Promise<void> {
  const closures = await listClosures(env, accountId);
  if (!closures.some((c) => c.eventId === eventId)) {
    throw new Error("that event was not a closure made here");
  }
  await proxyCall(env, {
    connectedAccountId: accountId,
    endpoint: `/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(eventId)}`,
    method: "DELETE",
  });
}

export interface BookingInput {
  reference: string;
  serviceName: string;
  addonNames: string[];
  estimate: number;
  estimateIsApprox: boolean;
  minutes: number;
  startIso: string;
  endIso: string;
  client: { name: string; email: string; phone: string };
  notes?: string;
}

export function eventTitle(input: BookingInput): string {
  const extras = input.addonNames.length ? ` + ${input.addonNames.join(" + ")}` : "";
  return `${input.client.name} - ${input.serviceName}${extras}`;
}

export function eventDescription(input: BookingInput): string {
  const money = `$${input.estimate}${input.estimateIsApprox ? "+" : ""}`;
  return [
    `Service: ${input.serviceName}`,
    input.addonNames.length ? `Add-ons: ${input.addonNames.join(", ")}` : "Add-ons: none",
    `Estimate: ${money} (card only)`,
    `Phone: ${input.client.phone}`,
    `Email: ${input.client.email}`,
    input.notes ? `Notes: ${input.notes}` : "",
    `Reference: ${input.reference}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// Writes the appointment into her calendar and invites the client, which is
// what sends the confirmation email. No separate mail provider needed.
//
// The reference is stamped into extendedProperties so a later reschedule or
// cancellation can find this exact event again without a mapping table.
export async function createBooking(env: Env, accountId: string, input: BookingInput): Promise<{ id: string; htmlLink?: string }> {
  const body = {
    summary: eventTitle(input),
    description: eventDescription(input),
    start: { dateTime: input.startIso, timeZone: TIMEZONE },
    end: { dateTime: input.endIso, timeZone: TIMEZONE },
    attendees: [{ email: input.client.email, displayName: input.client.name }],
    extendedProperties: { private: { jmBookingRef: input.reference } },
    reminders: { useDefault: true },
  };

  return proxyCall<{ id: string; htmlLink?: string }>(env, {
    connectedAccountId: accountId,
    // sendUpdates=all is what actually emails the client their invitation.
    endpoint: `/calendars/${encodeURIComponent(CALENDAR_ID)}/events?sendUpdates=all`,
    method: "POST",
    body,
  });
}
