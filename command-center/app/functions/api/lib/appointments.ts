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

export interface Calendar {
  id: string;
  name?: string;
  isActive?: boolean;
}
interface CalendarsResp {
  calendars?: Calendar[];
}

// The location's ACTIVE calendars. Uses ghlJson (the calendar LIST tolerates
// the default version, unlike free-slots/create which need calFetch's
// 2021-04-15). isActive is optional on the wire, so absent counts as active:
// that is the historical behaviour resolveCalendarByName has always had and
// callers depend on it.
export async function listCalendars(gctx: GhlContext): Promise<Calendar[]> {
  const data = await ghlJson<CalendarsResp>(
    gctx,
    `/calendars/?locationId=${encodeURIComponent(gctx.locationId)}`,
  );
  return (data.calendars ?? []).filter((c) => c.isActive !== false);
}

// GHL does not use a stable error code for "that calendar id is not real": a
// bad id comes back as a 404, or as a 4xx whose body names the calendar. Both
// callers (admin slots + book) need the same judgement, so it lives here with
// the rest of the calendar-API quirks rather than being duplicated per route.
export function isCalendarNotFound(status?: number, body?: string): boolean {
  if (status === 404) return true;
  return /calendar (was )?not found|invalid calendar|calendar (id )?(is )?invalid/i.test(
    body ?? "",
  );
}

// Resolve a booking calendar id by name (exact then contains), so a small GHL
// rename still lands and the client never hardcodes an id. Returns null if
// nothing matches.
export async function resolveCalendarByName(
  gctx: GhlContext,
  name: string,
): Promise<string | null> {
  const cals = await listCalendars(gctx);
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
//
// `title` is optional and OMITTING IT IS A CHOICE, not a shortcut. Every GHL
// calendar has its own event title (the agency's cold call calendar uses
// "{{contact.name}} x Hauck Marketing"), and a booking with no title of its own
// gets that name, exactly as a booking made inside GoHighLevel does. Sending one
// overrides the calendar for that appointment only, which is right for the
// surfaces that book a specific kind of job (Jobs, handoffs, onboarding) and
// wrong for cold call, where the app is standing in for GHL's own booker.
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

// Cancel an appointment. GHL cancels by setting appointmentStatus, not by
// DELETE (same pattern as functions/api/customers/[contactId]/plan.ts). The
// booking stays on the calendar as a cancelled record, which is also what
// keeps it out of listCalendarEvents consumers that filter dead statuses.
export async function cancelAppointment(
  gctx: GhlContext,
  eventId: string,
): Promise<{ ok: boolean; status: number; body?: string }> {
  const res = await calFetch(gctx, `/calendars/events/appointments/${encodeURIComponent(eventId)}`, {
    method: "PUT",
    body: JSON.stringify({ appointmentStatus: "cancelled" }),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: (await res.text()).slice(0, 300) };
  }
  return { ok: true, status: res.status };
}

// Booked events, as opposed to free slots. Lifted from the client-app route
// functions/api/calendar/events.ts so admin routes can list a client's
// appointments without a client-app session. Two things differ from that
// route on purpose: the events endpoint tolerates the default 2021-07-28
// version so this uses ghlJson rather than the private calFetch, and there
// is deliberately no contact-name map. events.ts pulls up to 1000 contacts
// per request to fill names in; that cost is not acceptable on a route a
// setter hits every time they change week, so an unnamed contact comes back
// with an empty contactName and the caller decides what to show.
export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  contactId: string;
  contactName: string;
  // Which calendar this came off. Carried because the caller cannot work it out
  // afterwards: the events of several calendars arrive as one flat list, and
  // the Sales Calls picker needs to tell a demo call from a sales call.
  calendarId: string;
  calendarName: string;
}

interface RawEvent {
  id?: string;
  _id?: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  appointmentStatus?: string;
  status?: string;
  contactId?: string;
  contactName?: string;
}

// The events plus the calendars that could not be read. The second half is not
// optional bookkeeping: the Setter Suite Calendar tab is a WRITE surface, and a
// grid missing one calendar's appointments but presented as complete is how a
// setter offers a slot that is already taken. functions/api/calendar/events.ts
// swallows the same failure silently, which is fine there because that route is
// read-only; here the caller has to be able to tell the setter.
export interface CalendarEventsResult {
  events: CalendarEvent[];
  failedCalendarIds: string[];
}

// [startMs, endMs] are epoch milliseconds, not ISO: the GHL events route
// rejects ISO on startTime/endTime. Callers holding ISO strings parse first.
//
// One calendar 4xxing does not reject the whole promise (that blanked the tab
// on a 502); its id is collected into failedCalendarIds instead. The calendar
// LIST failing still throws: there is nothing to be partial about, and the
// caller cannot tell a client with no calendars from a CRM outage.
// `only` narrows the read to specific calendars. Absent means every calendar on
// the account, which is right for a setter's grid (a slot is taken whatever
// booked it) and wrong for the sales meetings page: the agency's Onboarding
// calendar is linked to a personal Google account, so reading everything there
// produces a sales pipeline containing flights and a school prom.
export async function listCalendarEvents(
  gctx: GhlContext,
  startMs: number,
  endMs: number,
  only?: string[],
): Promise<CalendarEventsResult> {
  const all = await listCalendars(gctx);
  const wanted = only && only.length > 0 ? new Set(only) : null;
  const calendars = wanted ? all.filter((c) => wanted.has(c.id)) : all;
  if (calendars.length === 0) return { events: [], failedCalendarIds: [] };

  const byId = new Map<string, CalendarEvent>();
  const failedCalendarIds: string[] = [];
  for (const cal of calendars) {
    let data: { events?: RawEvent[] };
    try {
      data = await ghlJson<{ events?: RawEvent[] }>(
        gctx,
        `/calendars/events?locationId=${encodeURIComponent(gctx.locationId)}` +
          `&calendarId=${encodeURIComponent(cal.id)}` +
          `&startTime=${startMs}&endTime=${endMs}`,
      );
    } catch (e) {
      console.warn(`[appointments.listCalendarEvents] calendar ${cal.id}`, e);
      failedCalendarIds.push(cal.id);
      continue;
    }
    for (const ev of data.events ?? []) {
      // The same appointment can surface on more than one calendar, so first
      // sighting wins and later duplicates are ignored.
      const id = ev.id ?? ev._id ?? "";
      if (!id || byId.has(id)) continue;
      byId.set(id, {
        id,
        title: ev.title ?? "Appointment",
        startTime: ev.startTime ?? null,
        endTime: ev.endTime ?? null,
        status: (ev.appointmentStatus ?? ev.status ?? "booked").toLowerCase(),
        contactId: ev.contactId ?? "",
        contactName: ev.contactName ?? "",
        // The calendar being read on this pass. First sighting wins above, so
        // an appointment that surfaces on two calendars is attributed to the
        // first one read, which is the same rule its row already follows.
        calendarId: cal.id,
        calendarName: cal.name ?? "",
      });
    }
  }

  const events = [...byId.values()].sort((a, b) =>
    (a.startTime ?? "").localeCompare(b.startTime ?? ""),
  );
  return { events, failedCalendarIds };
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
