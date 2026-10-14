// The "Booking hours" calendar: when she is open.
//
// Every event on this calendar is a window in which an appointment may START.
// There is no title convention to get wrong: if it is on this calendar, she is
// open. Her weekly schedule is one recurring event per window; a one-off extra
// day is a single event.
//
// Google expands recurrences for us when asked with singleEvents, so nothing
// here parses an RRULE, and daylight saving comes back already correct: the
// same 13:30 window returns -05:00 in October and -06:00 in November.
//
// Closures are NOT here. They are all-day busy events on her primary calendar,
// because subtracting busy from open windows is the path that already works.

import { HOURS_CALENDAR_NAME, TIMEZONE } from "./config.ts";
import type { Interval } from "./availability.ts";
import { type Env, proxyCall } from "./composio.ts";

// 0 = Sunday, matching config.HOURS and Date.getUTCDay.
const RRULE_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export interface OpenWindow {
  // 0-6, or null for a one-off window on a single date.
  weekday: number | null;
  from: string; // "13:30" in her timezone
  to: string; // "18:00", the last bookable start
  date?: string; // one-offs only, YYYY-MM-DD
  eventId?: string;
}

interface GoogleEvent {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  recurrence?: string[];
  extendedProperties?: { private?: Record<string, string> };
}

// The calendar id, looked up by name once per isolate. Her account has one
// other calendar, so this is cheap, and caching it saves a round trip on the
// hot availability path.
let cachedId: string | null = null;

export function forgetCalendarCache(): void {
  cachedId = null;
}

export async function findHoursCalendar(env: Env, accountId: string): Promise<string | null> {
  if (cachedId) return cachedId;
  const list = await proxyCall<{ items?: { id?: string; summary?: string }[] }>(env, {
    connectedAccountId: accountId,
    endpoint: "/users/me/calendarList",
    method: "GET",
  });
  const found = (list.items ?? []).find((c) => c.summary === HOURS_CALENDAR_NAME);
  cachedId = found?.id ?? null;
  return cachedId;
}

// Only ever called from the admin page. The booking path treats a missing
// calendar as "fall back to the hardcoded hours", never as a reason to write.
export async function ensureHoursCalendar(env: Env, accountId: string): Promise<string> {
  const existing = await findHoursCalendar(env, accountId);
  if (existing) return existing;

  const made = await proxyCall<{ id: string }>(env, {
    connectedAccountId: accountId,
    endpoint: "/calendars",
    method: "POST",
    body: { summary: HOURS_CALENDAR_NAME, timeZone: TIMEZONE },
  });
  cachedId = made.id;
  return made.id;
}

function eventsPath(calendarId: string): string {
  return `/calendars/${encodeURIComponent(calendarId)}/events`;
}

// Her open windows between two instants, already expanded from any recurrence.
//
// Anything unparseable is dropped rather than becoming an Invalid Date. An
// all-day event is ignored too: a window needs a start and end time to mean
// anything, and the settings record is an all-day event in the year 2000.
export async function readOpenWindows(
  env: Env,
  accountId: string,
  calendarId: string,
  fromIso: string,
  toIso: string,
): Promise<Interval[]> {
  const qs = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: fromIso,
    timeMax: toIso,
    maxResults: "250",
  });
  const res = await proxyCall<{ items?: GoogleEvent[] }>(env, {
    connectedAccountId: accountId,
    endpoint: `${eventsPath(calendarId)}?${qs}`,
    method: "GET",
  });
  return parseWindows(res?.items);
}

// Exported for tests.
export function parseWindows(items: unknown): Interval[] {
  if (!Array.isArray(items)) return [];
  const out: Interval[] = [];
  for (const e of items as GoogleEvent[]) {
    if (!e?.start?.dateTime || !e?.end?.dateTime) continue;
    const start = Date.parse(e.start.dateTime);
    const end = Date.parse(e.end.dateTime);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
    out.push({ start, end });
  }
  return out;
}

// Her weekly schedule as she set it, read back from the recurring events rather
// than from a copy, so the page always shows what is actually in force.
export async function readWeekly(env: Env, accountId: string, calendarId: string): Promise<OpenWindow[]> {
  const qs = new URLSearchParams({
    privateExtendedProperty: "jmKind=weekly",
    maxResults: "50",
    showDeleted: "false",
  });
  const res = await proxyCall<{ items?: GoogleEvent[] }>(env, {
    connectedAccountId: accountId,
    endpoint: `${eventsPath(calendarId)}?${qs}`,
    method: "GET",
  });

  const out: OpenWindow[] = [];
  for (const e of res?.items ?? []) {
    const priv = e.extendedProperties?.private ?? {};
    const weekday = Number(priv.jmDay);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
    if (!priv.jmFrom || !priv.jmTo) continue;
    out.push({ weekday, from: priv.jmFrom, to: priv.jmTo, eventId: e.id });
  }
  return out.sort((a, b) => (a.weekday! - b.weekday!) || a.from.localeCompare(b.from));
}

// Replaces the whole weekly schedule.
//
// Delete then create, rather than diffing. A stylist's week is at most a dozen
// events, and a half-applied diff is a book that is open when she is not.
export async function writeWeekly(
  env: Env,
  accountId: string,
  calendarId: string,
  windows: OpenWindow[],
  anchorDateISO: string,
): Promise<void> {
  const existing = await readWeekly(env, accountId, calendarId);
  for (const w of existing) {
    if (!w.eventId) continue;
    await proxyCall(env, {
      connectedAccountId: accountId,
      endpoint: `${eventsPath(calendarId)}/${encodeURIComponent(w.eventId)}`,
      method: "DELETE",
    });
  }

  for (const w of windows) {
    if (w.weekday === null) continue;
    // The anchor only has to BE that weekday; the recurrence carries the rest.
    const date = anchorFor(anchorDateISO, w.weekday);
    await proxyCall(env, {
      connectedAccountId: accountId,
      endpoint: eventsPath(calendarId),
      method: "POST",
      body: {
        summary: "Open for bookings",
        start: { dateTime: `${date}T${w.from}:00`, timeZone: TIMEZONE },
        end: { dateTime: `${date}T${w.to}:00`, timeZone: TIMEZONE },
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${RRULE_DAYS[w.weekday]}`],
        transparency: "transparent",
        extendedProperties: {
          private: { jmKind: "weekly", jmDay: String(w.weekday), jmFrom: w.from, jmTo: w.to },
        },
      },
    });
  }
}

// The first date on or after the anchor that falls on the wanted weekday.
// Exported for tests: an off-by-one here shifts her whole week.
export function anchorFor(dateISO: string, weekday: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const shift = (weekday - base.getUTCDay() + 7) % 7;
  const out = new Date(Date.UTC(y, m - 1, d + shift));
  return `${out.getUTCFullYear()}-${String(out.getUTCMonth() + 1).padStart(2, "0")}-${String(out.getUTCDate()).padStart(2, "0")}`;
}

// A single extra day she decides to work, on top of the weekly schedule.
export async function addExtraDay(
  env: Env,
  accountId: string,
  calendarId: string,
  dateISO: string,
  from: string,
  to: string,
): Promise<void> {
  await proxyCall(env, {
    connectedAccountId: accountId,
    endpoint: eventsPath(calendarId),
    method: "POST",
    body: {
      summary: "Open for bookings",
      start: { dateTime: `${dateISO}T${from}:00`, timeZone: TIMEZONE },
      end: { dateTime: `${dateISO}T${to}:00`, timeZone: TIMEZONE },
      transparency: "transparent",
      extendedProperties: { private: { jmKind: "extra", jmDate: dateISO } },
    },
  });
}

export async function listExtraDays(env: Env, accountId: string, calendarId: string): Promise<OpenWindow[]> {
  const qs = new URLSearchParams({ privateExtendedProperty: "jmKind=extra", maxResults: "100" });
  const res = await proxyCall<{ items?: GoogleEvent[] }>(env, {
    connectedAccountId: accountId,
    endpoint: `${eventsPath(calendarId)}?${qs}`,
    method: "GET",
  });
  const out: OpenWindow[] = [];
  for (const e of res?.items ?? []) {
    const date = e.extendedProperties?.private?.jmDate;
    if (!date || !e.start?.dateTime || !e.end?.dateTime) continue;
    out.push({
      weekday: null,
      date,
      from: e.start.dateTime.slice(11, 16),
      to: e.end.dateTime.slice(11, 16),
      eventId: e.id,
    });
  }
  return out.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

export async function deleteEvent(
  env: Env,
  accountId: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  await proxyCall(env, {
    connectedAccountId: accountId,
    endpoint: `${eventsPath(calendarId)}/${encodeURIComponent(eventId)}`,
    method: "DELETE",
  });
}
