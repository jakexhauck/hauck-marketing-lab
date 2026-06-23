import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";

// Google Calendar REST helpers for the admin calendar. One agency Google account
// whose refresh token lives in calendar_connection (mirrors drive_connection).

const CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// calendar.events: read + write events on the connected account's calendars.
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export class CalendarNotConnectedError extends Error {
  constructor(message = "Google Calendar is not connected yet.") {
    super(message);
    this.name = "CalendarNotConnectedError";
  }
}

interface ConnectionRow {
  refresh_token: string | null;
  access_token: string | null;
  access_token_expires_at: string | null;
  connected_email: string | null;
  google_calendar_id: string | null;
}

export async function calendarConnection(
  supabase: SupabaseClient,
): Promise<{ connected: boolean; email: string | null; calendarId: string }> {
  const { data } = await supabase
    .from("calendar_connection")
    .select("refresh_token, connected_email, google_calendar_id")
    .eq("id", true)
    .maybeSingle();
  const row = data as Pick<ConnectionRow, "refresh_token" | "connected_email" | "google_calendar_id"> | null;
  return {
    connected: !!row?.refresh_token,
    email: row?.connected_email ?? null,
    calendarId: row?.google_calendar_id || "primary",
  };
}

export async function getCalendarAccessToken(env: Env, supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from("calendar_connection")
    .select("refresh_token, access_token, access_token_expires_at")
    .eq("id", true)
    .maybeSingle();
  const row = data as ConnectionRow | null;
  if (!row?.refresh_token) throw new CalendarNotConnectedError();

  const exp = row.access_token_expires_at ? Date.parse(row.access_token_expires_at) : 0;
  if (row.access_token && Number.isFinite(exp) && exp - Date.now() > 60_000) {
    return row.access_token;
  }

  const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured (missing client id/secret).");

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    if (text.includes("invalid_grant")) {
      throw new CalendarNotConnectedError("Google access was revoked. Reconnect the calendar.");
    }
    throw new Error(`Google token refresh failed (${resp.status}): ${text}`);
  }
  const parsed = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!parsed.access_token) throw new Error(`Google token refresh returned no access_token: ${text}`);
  const expiresAt = new Date(Date.now() + (parsed.expires_in ?? 3600) * 1000).toISOString();

  await supabase
    .from("calendar_connection")
    .update({ access_token: parsed.access_token, access_token_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq("id", true);

  return parsed.access_token;
}

export interface WorkBlockEvent {
  title: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
}

function eventBody(block: WorkBlockEvent, tz: string) {
  return {
    summary: block.title,
    start: { dateTime: new Date(block.startsAt).toISOString(), timeZone: tz },
    end: { dateTime: new Date(block.endsAt).toISOString(), timeZone: tz },
  };
}

export async function insertEvent(token: string, calendarId: string, block: WorkBlockEvent, tz: string): Promise<string> {
  const resp = await fetch(`${CAL_BASE}/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(eventBody(block, tz)),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Google insert event failed (${resp.status}): ${text}`);
  const parsed = JSON.parse(text) as { id?: string };
  if (!parsed.id) throw new Error("Google insert event returned no id");
  return parsed.id;
}

export async function patchEvent(token: string, calendarId: string, eventId: string, block: WorkBlockEvent, tz: string): Promise<void> {
  const resp = await fetch(`${CAL_BASE}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(eventBody(block, tz)),
  });
  if (!resp.ok) throw new Error(`Google patch event failed (${resp.status}): ${await resp.text()}`);
}

export async function deleteEvent(token: string, calendarId: string, eventId: string): Promise<void> {
  const resp = await fetch(`${CAL_BASE}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  // 404/410: already gone on Google's side. Treat as success.
  if (resp.ok || resp.status === 404 || resp.status === 410) return;
  throw new Error(`Google delete event failed (${resp.status}): ${await resp.text()}`);
}

export interface GoogleCalEvent {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
}

interface RawGoogleEvent {
  id?: string;
  summary?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export async function listEvents(token: string, calendarId: string, fromIso: string, toIso: string): Promise<GoogleCalEvent[]> {
  const params = new URLSearchParams({
    timeMin: new Date(fromIso).toISOString(),
    timeMax: new Date(toIso).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const resp = await fetch(`${CAL_BASE}/${encodeURIComponent(calendarId)}/events?${params}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Google list events failed (${resp.status}): ${text}`);
  const parsed = JSON.parse(text) as { items?: RawGoogleEvent[] };
  return (parsed.items ?? [])
    .filter((e) => e.id && e.status !== "cancelled")
    .map((e) => ({
      id: e.id as string,
      title: e.summary ?? "(busy)",
      startTime: e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00` : null),
      endTime: e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00` : null),
      allDay: !!e.start?.date,
    }));
}
