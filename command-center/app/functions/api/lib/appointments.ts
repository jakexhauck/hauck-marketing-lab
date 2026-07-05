// Calendar/appointment write helpers for the action-wiring surfaces (Leads
// "book intro call" / "book in-person visit", Jobs "reschedule"). Kept in this
// feature file, not functions/lib/ghl.ts, so the calendar-API quirks stay put:
//
//  - The calendars API needs Version 2021-04-15, NOT the 2021-07-28 that the
//    shared ghlFetch pins, so these go through a local calFetch.
//  - free-slots + appointment-create only work on EVENT-type calendars. A
//    round-robin calendar with no team members 422s "The calendar doesn't have
//    any team members associated" (confirmed against Willis); we detect that and
//    surface a `needsStaff` flag so the client shows an honest message instead of
//    a generic failure.
//  - Calendars are resolved BY NAME per tenant (exact then contains), never by
//    hardcoded id, mirroring the stage resolver in ./writes.ts.

import { ghlJson, type GhlContext } from "../../lib/ghl";

const BASE = "https://services.leadconnectorhq.com";
const CAL_VERSION = "2021-04-15";

// Raw fetch against the calendars API at its required version. POSTs are not
// retried (a double-create would double-book); GET/PUT are safe but we keep this
// minimal and let callers decide.
async function calFetch(
  gctx: GhlContext,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${gctx.token}`);
  headers.set("Version", CAL_VERSION);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(BASE + path, { ...init, headers });
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

interface Calendar {
  id: string;
  name?: string;
  isActive?: boolean;
}
interface CalendarsResp {
  calendars?: Calendar[];
}

// Resolve a booking calendar id by name (exact then contains), so a small GHL
// rename still lands and the client never hardcodes an id. Uses ghlJson (the
// calendar LIST tolerates the default version). Returns null if nothing matches.
export async function resolveCalendarByName(
  gctx: GhlContext,
  name: string,
): Promise<string | null> {
  const data = await ghlJson<CalendarsResp>(
    gctx,
    `/calendars/?locationId=${encodeURIComponent(gctx.locationId)}`,
  );
  const cals = (data.calendars ?? []).filter((c) => c.isActive !== false);
  const want = norm(name);
  const cal =
    cals.find((c) => norm(c.name ?? "") === want) ??
    cals.find((c) => norm(c.name ?? "").includes(want));
  return cal?.id ?? null;
}

export interface FreeSlotsResult {
  ok: boolean;
  days: { date: string; slots: string[] }[];
  needsStaff?: boolean;
  status?: number;
  body?: string;
}

// Available slots for a calendar over [startMs, endMs], grouped by day. On the
// round-robin "no team members" 422 we return ok:false + needsStaff:true so the
// caller degrades honestly rather than erroring.
export async function getFreeSlots(
  gctx: GhlContext,
  calendarId: string,
  startMs: number,
  endMs: number,
  timezone?: string,
): Promise<FreeSlotsResult> {
  const q = new URLSearchParams({ startDate: String(startMs), endDate: String(endMs) });
  if (timezone) q.set("timezone", timezone);
  const res = await calFetch(
    gctx,
    `/calendars/${encodeURIComponent(calendarId)}/free-slots?${q.toString()}`,
  );
  if (!res.ok) {
    const body = await res.text();
    return {
      ok: false,
      days: [],
      needsStaff: /team member/i.test(body),
      status: res.status,
      body: body.slice(0, 300),
    };
  }
  const data = (await res.json()) as Record<string, unknown>;
  const days: { date: string; slots: string[] }[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === "traceId") continue;
    const slots = (value as { slots?: unknown })?.slots;
    if (Array.isArray(slots) && slots.length > 0) {
      days.push({ date: key, slots: slots.filter((s): s is string => typeof s === "string") });
    }
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return { ok: true, days };
}

export type ApptWriteResult =
  | { ok: true; id: string }
  | { ok: false; needsStaff?: boolean; status: number; body: string };

// Create an appointment on a calendar. Confirmed shape (Willis live test):
// POST /calendars/events/appointments { calendarId, locationId, contactId,
// startTime, endTime, title? } -> 201 { id, status, appointmentStatus }.
export async function createAppointment(
  gctx: GhlContext,
  input: {
    calendarId: string;
    contactId: string;
    startTime: string;
    endTime: string;
    title?: string;
  },
): Promise<ApptWriteResult> {
  const payload: Record<string, unknown> = {
    calendarId: input.calendarId,
    locationId: gctx.locationId,
    contactId: input.contactId,
    startTime: input.startTime,
    endTime: input.endTime,
  };
  if (input.title) payload.title = input.title;

  const res = await calFetch(gctx, `/calendars/events/appointments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    return {
      ok: false,
      needsStaff: /team member/i.test(body),
      status: res.status,
      body: body.slice(0, 300),
    };
  }
  const data = (await res.json()) as { id?: string; appointment?: { id?: string } };
  return { ok: true, id: data.id ?? data.appointment?.id ?? "" };
}

// Reschedule an existing appointment. Confirmed shape (Willis live test):
// PUT /calendars/events/appointments/{eventId} { startTime, endTime } -> 200.
export async function rescheduleAppointment(
  gctx: GhlContext,
  eventId: string,
  startTime: string,
  endTime: string,
): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const res = await calFetch(
    gctx,
    `/calendars/events/appointments/${encodeURIComponent(eventId)}`,
    { method: "PUT", body: JSON.stringify({ startTime, endTime }) },
  );
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, body: body.slice(0, 300) };
  }
  return { ok: true };
}
