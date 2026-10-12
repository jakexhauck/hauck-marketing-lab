import type { Env, ApiData } from "../../../lib/env";
import { getAgencyGhlContext, agencyTimezone, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import { getCalendar, getFreeSlots, listCalendarEvents, listCalendars } from "../../lib/appointments";
import { getBusyEvents, getConnection } from "../../../lib/googleCalendar";
import { AGENCY_GCAL_USER, pickColdSmsCalendar } from "../../../lib/coldSmsBoard";

// GET /api/admin/cold-sms/week?start=<ms>&end=<ms>  (owner only)
//
// One week for the booking wizard, three layers:
//   slots   open times on the Cold SMS calendar (pickColdSmsCalendar) (GHL's own free-slots,
//           so its availability rules and buffers are the ones that apply)
//   demos   demos already booked on any demo calendar
//   google  Jake's own Google Calendar, through the Composio link
//
// Google is drawn AND subtracted: a free GHL slot that collides with a busy
// Google event is dropped, because GHL only knows about Google if its own sync
// is on, and the wizard must never offer a time he is not free.

const MAX_RANGE = 8 * 24 * 60 * 60 * 1000;
const DEMO_CALENDAR = /demo/i;

function minutes(detail: { slotDuration?: number; slotDurationUnit?: string } | null): number {
  const n = detail?.slotDuration ?? 30;
  return /hour/i.test(detail?.slotDurationUnit ?? "") ? n * 60 : n;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!isAgencyGhlConfigured(ctx.env)) return Response.json({ error: "not_configured" }, { status: 503 });
  const params = new URL(ctx.request.url).searchParams;
  const start = Number(params.get("start"));
  const end = Number(params.get("end"));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > MAX_RANGE) {
    return Response.json({ error: "bad_range" }, { status: 400 });
  }

  const agency = getAgencyGhlContext(ctx.env);
  const timezone = agencyTimezone(ctx.env);

  let calendars;
  try {
    calendars = await listCalendars(agency);
  } catch {
    return Response.json({ error: "ghl_unavailable" }, { status: 502 });
  }
  const calendar = pickColdSmsCalendar(calendars);
  const demoIds = calendars.filter((c) => DEMO_CALENDAR.test(c.name ?? "")).map((c) => c.id);

  const gconn = await getConnection(ctx.env, AGENCY_GCAL_USER);
  const from = Math.max(start, Date.now());

  const [detail, free, demos, google] = await Promise.all([
    calendar ? getCalendar(agency, calendar.id) : Promise.resolve(null),
    calendar && end > from ? getFreeSlots(agency, calendar.id, from, end, timezone) : Promise.resolve(null),
    demoIds.length
      ? listCalendarEvents(agency, start, end, demoIds).catch(() => ({ events: [], failedCalendarIds: demoIds }))
      : Promise.resolve({ events: [], failedCalendarIds: [] as string[] }),
    gconn.connected
      ? getBusyEvents(ctx.env, AGENCY_GCAL_USER, {
          timeMin: new Date(start).toISOString(),
          timeMax: new Date(end).toISOString(),
        })
      : Promise.resolve([]),
  ]);

  const length = minutes(detail);
  const busy = google.map((g) => [+new Date(g.start), +new Date(g.end)] as const);
  const slots = (free && free.ok ? free.days.flatMap((d) => d.slots) : [])
    .map((s) => +new Date(s))
    .filter((t) => Number.isFinite(t) && t > Date.now())
    .filter((t) => !busy.some(([a, b]) => t < b && t + length * 60_000 > a))
    .sort((a, b) => a - b)
    .map((t) => new Date(t).toISOString());

  return Response.json({
    timezone,
    calendar: calendar ? { id: calendar.id, name: calendar.name ?? "", minutes: length } : null,
    slotsFailed: Boolean(calendar && free && !free.ok),
    slots,
    demos: demos.events
      .filter((e) => e.startTime && e.endTime && !/cancel|invalid|noshow/i.test(e.status))
      .map((e) => ({ id: e.id, title: e.contactName || e.title, start: e.startTime, end: e.endTime })),
    google: {
      connected: gconn.connected,
      events: google.map((g) => ({ title: g.title || "Busy", start: g.start, end: g.end })),
    },
  });
};
