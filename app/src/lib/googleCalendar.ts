/**
 * Google Calendar integration via the Calendar API v3 + API key.
 *
 * Public calendars only — no OAuth. The endpoint supports CORS so we hit it
 * directly from the renderer; no Tauri command needed.
 */
import type { CalendarConnection } from "./types";

export interface GCalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
}

interface GCalApiDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface GCalApiItem {
  id?: string;
  summary?: string;
  location?: string;
  start?: GCalApiDateTime;
  end?: GCalApiDateTime;
  status?: string;
}

interface GCalApiResponse {
  items?: GCalApiItem[];
  error?: { message?: string; errors?: Array<{ message?: string; reason?: string }> };
}

function parseApiDateTime(dt: GCalApiDateTime | undefined): { date: Date; allDay: boolean } | null {
  if (!dt) return null;
  if (dt.date) {
    // All-day events: YYYY-MM-DD, treated as local-midnight.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dt.date);
    if (!m) return null;
    const [, y, mo, d] = m;
    return { date: new Date(Number(y), Number(mo) - 1, Number(d)), allDay: true };
  }
  if (dt.dateTime) {
    const date = new Date(dt.dateTime);
    if (Number.isNaN(date.getTime())) return null;
    return { date, allDay: false };
  }
  return null;
}

function extractErrorMessage(body: unknown, status: number, statusText: string): string {
  if (body && typeof body === "object") {
    const resp = body as GCalApiResponse;
    if (resp.error?.message) return resp.error.message;
    const inner = resp.error?.errors?.[0]?.message;
    if (inner) return inner;
  }
  return `Google Calendar API error: ${status} ${statusText}`.trim();
}

export async function fetchCalendarEvents(
  connection: CalendarConnection,
  rangeDays?: number,
): Promise<GCalEvent[]> {
  const days = rangeDays ?? 60;
  const now = new Date();
  const timeMin = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    connection.calendarId,
  )}/events`;
  const params = new URLSearchParams({
    key: connection.apiKey,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    showDeleted: "false",
  });
  const url = `${base}?${params.toString()}`;

  let resp: Response;
  try {
    resp = await fetch(url);
  } catch (err) {
    throw new Error(
      `Network error contacting Google Calendar: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let parsed: unknown = null;
  try {
    parsed = await resp.json();
  } catch {
    // fall through — handled below
  }

  if (!resp.ok) {
    throw new Error(extractErrorMessage(parsed, resp.status, resp.statusText));
  }

  const items = (parsed as GCalApiResponse | null)?.items ?? [];
  const events: GCalEvent[] = [];
  for (const item of items) {
    if (item.status === "cancelled") continue;
    const start = parseApiDateTime(item.start);
    const end = parseApiDateTime(item.end);
    if (!start) continue;
    const endDate = end ? end.date : (
      start.allDay
        ? new Date(start.date.getFullYear(), start.date.getMonth(), start.date.getDate() + 1)
        : new Date(start.date.getTime() + 60 * 60 * 1000)
    );
    events.push({
      id: item.id ?? `${start.date.getTime()}-${item.summary ?? ""}`,
      title: item.summary ?? "(no title)",
      start: start.date,
      end: endDate,
      allDay: start.allDay,
      location: item.location,
    });
  }
  return events;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function eventsOn(events: GCalEvent[], day: Date): GCalEvent[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return events.filter((e) => {
    if (e.allDay) {
      // All-day events: include if the day falls in [start, end).
      return e.start.getTime() < dayEnd.getTime() && e.end.getTime() > dayStart.getTime();
    }
    if (sameLocalDay(e.start, day)) return true;
    // Multi-day timed events overlapping this day.
    return e.start.getTime() < dayEnd.getTime() && e.end.getTime() > dayStart.getTime();
  });
}

export function activeDaysInMonth(events: GCalEvent[], year: number, month: number): Set<number> {
  const out = new Set<number>();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  for (const e of events) {
    if (e.end.getTime() <= monthStart.getTime()) continue;
    if (e.start.getTime() >= monthEnd.getTime()) continue;
    const from = e.start.getTime() < monthStart.getTime() ? monthStart : e.start;
    // For all-day events, e.end is exclusive (next day at 00:00); shave one ms
    // so we don't bleed into the next day's cell.
    const toRaw = e.end.getTime() > monthEnd.getTime() ? monthEnd : e.end;
    const to = e.allDay ? new Date(toRaw.getTime() - 1) : toRaw;
    const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    while (cursor.getTime() <= to.getTime()) {
      if (cursor.getFullYear() === year && cursor.getMonth() === month) {
        out.add(cursor.getDate());
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return out;
}
