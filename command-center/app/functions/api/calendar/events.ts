import type { Env, ApiData } from "../../lib/env";
import { ghlJson } from "../../lib/ghl";

interface GhlCalendar {
  id: string;
  name?: string;
  timezone?: string;
}
interface CalendarsResp {
  calendars?: GhlCalendar[];
}

interface GhlEvent {
  id?: string;
  _id?: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  appointmentStatus?: string;
  status?: string;
  contactId?: string;
  contactName?: string;
  address?: string;
  meetingLocation?: string;
  meetingUrl?: string;
  notes?: string;
}
interface EventsResp {
  events?: GhlEvent[];
}

interface GhlContactLite {
  id: string;
  contactName?: string;
  firstName?: string;
  lastName?: string;
}
interface ContactsResp {
  contacts?: GhlContactLite[];
  meta?: { nextPageUrl?: string };
}

interface ApiCalendarEvent {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  contactId: string;
  contactName: string;
  address: string;
  meetingUrl: string;
  notes: string;
}

// 5-minute in-memory cache of the calendar discovery, same pattern as pipeline.ts.
interface CacheEntry {
  data: GhlCalendar[];
  expiresAt: number;
}
const calCache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60_000;

async function discoverCalendars(
  token: string,
  locationId: string,
): Promise<GhlCalendar[]> {
  const key = `calendars:${locationId}`;
  const hit = calCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  const data = await ghlJson<CalendarsResp>(
    { token, locationId },
    `/calendars/?locationId=${encodeURIComponent(locationId)}`,
  );
  const calendars = data.calendars ?? [];
  calCache.set(key, { data: calendars, expiresAt: Date.now() + TTL_MS });
  return calendars;
}

// Paginated contacts fetch as an id -> name lookup, so enrichment is not N
// requests. Capped at 1000 contacts (10 pages) with the standard warning.
async function contactNameMap(
  token: string,
  locationId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    let url = `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=100`;
    let pageCount = 0;
    const maxPages = 10;
    while (url && pageCount < maxPages) {
      const data = await ghlJson<ContactsResp>({ token, locationId }, url);
      const page = data.contacts ?? [];
      for (const c of page) {
        const name =
          c.contactName ||
          [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
        if (c.id && name) map.set(c.id, name);
      }
      const next = data.meta?.nextPageUrl;
      if (!next || page.length === 0) break;
      url = next;
      pageCount += 1;
    }
    if (pageCount >= maxPages) {
      console.warn(
        `calendar contact-name pagination hit maxPages cap for location ${locationId}`,
      );
    }
  } catch (e) {
    console.warn("[calendar.contactMap]", e);
  }
  return map;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const url = new URL(ctx.request.url);

  const now = Date.now();
  // Parse the window bounds defensively. An unparseable ?from / ?to yields NaN
  // from getTime(), which would interpolate "startTime=NaN" into the GHL query
  // and silently return nothing for every calendar. Fall back to the default
  // window (now .. now+30d) on bad input instead.
  const parseMs = (raw: string | null, fallback: number): number => {
    if (!raw) return fallback;
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) ? ms : fallback;
  };
  const fromMs = parseMs(url.searchParams.get("from"), now);
  const toMs = parseMs(url.searchParams.get("to"), now + 30 * 24 * 60 * 60_000);

  const calendars = await discoverCalendars(t.ghl_token, t.ghl_location_id);
  if (calendars.length === 0) {
    return Response.json({ events: [], timezone: null });
  }

  // GHL requires a calendarId (or user/group) alongside the time window. Query
  // each calendar and merge; clients typically have one or two.
  const seen = new Set<string>();
  const merged: GhlEvent[] = [];
  for (const cal of calendars) {
    try {
      const data = await ghlJson<EventsResp>(
        { token: t.ghl_token, locationId: t.ghl_location_id },
        `/calendars/events?locationId=${encodeURIComponent(t.ghl_location_id)}&calendarId=${encodeURIComponent(cal.id)}&startTime=${fromMs}&endTime=${toMs}`,
      );
      for (const ev of data.events ?? []) {
        const id = ev.id ?? ev._id;
        if (id && !seen.has(id)) {
          seen.add(id);
          merged.push(ev);
        }
      }
    } catch (e) {
      console.warn(`[calendar.events] calendar ${cal.id}`, e);
    }
  }

  const names = await contactNameMap(t.ghl_token, t.ghl_location_id);
  const timezone = calendars.find((c) => c.timezone)?.timezone ?? null;

  const events: ApiCalendarEvent[] = merged.map((ev) => {
    const id = (ev.id ?? ev._id) as string;
    const contactId = ev.contactId ?? "";
    return {
      id,
      title: ev.title ?? "Appointment",
      startTime: ev.startTime ?? null,
      endTime: ev.endTime ?? null,
      status: (ev.appointmentStatus ?? ev.status ?? "booked").toLowerCase(),
      contactId,
      contactName: ev.contactName ?? names.get(contactId) ?? "",
      address: ev.address ?? ev.meetingLocation ?? "",
      meetingUrl: ev.meetingUrl ?? "",
      notes: ev.notes ?? "",
    };
  });

  events.sort((a, b) => +new Date(a.startTime ?? 0) - +new Date(b.startTime ?? 0));

  return Response.json({ events, timezone });
};
