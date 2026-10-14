import { ghlJson, type GhlContext } from "./ghl";

// The estimate model behind the Ads Dashboard (tenants.estimate_tracking, 0153).
//
//   Estimates  a lead with an appointment on the client's estimate calendar
//              ("Home Estimate" in the snapshot). Cancelled ones still count:
//              the ad got them booked, and showing up is a separate problem.
//   Jobs       a customer_jobs row, which the owner's outcome link writes on
//              Sold (api/estimate-outcome.ts).
//
// Calendars are found by NAME, never by id, so a client loaded from the
// snapshot needs no setup in the app.

export interface NamedCalendar {
  id: string;
  name?: string;
  isActive?: boolean;
}

export interface EstimateCalendars {
  estimate: NamedCalendar;
  job: NamedCalendar | null;
}

function norm(s: string | undefined): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// "Home Estimate" is the estimate calendar; "Job" (or "Jobs") the job calendar.
// The job match is a whole word so "Window Cleaning Service" or a phone
// calendar can never be taken for it.
export function pickEstimateCalendars(calendars: NamedCalendar[]): EstimateCalendars | null {
  const live = calendars.filter((c) => c.id && c.isActive !== false);
  const estimate = live.find((c) => norm(c.name).includes("estimate"));
  if (!estimate) return null;
  const job =
    live.find((c) => c.id !== estimate.id && /\bjobs?\b/.test(norm(c.name)) && !norm(c.name).includes("estimate")) ??
    null;
  return { estimate, job };
}

export async function loadEstimateCalendars(gctx: GhlContext): Promise<EstimateCalendars | null> {
  const data = await ghlJson<{ calendars?: NamedCalendar[] }>(
    gctx,
    `/calendars/?locationId=${encodeURIComponent(gctx.locationId)}`,
  );
  return pickEstimateCalendars(data.calendars ?? []);
}

// How far either side of today the estimate calendar is read. Matches the other
// calendar reads in the app. A lead is dated by when it came in, so this only
// limits "Maximum": an estimate older than this is not counted there.
const EVENT_WINDOW_DAYS = 180;

export interface EstimateEvent {
  id: string;
  contactId: string;
  startTime: string;
  status: string;
}

// Raw calendar events to estimates. Deleted events are not bookings at all;
// cancelled and no-show ones are kept on purpose (see the header).
export function toEstimateEvents(rows: Record<string, unknown>[]): EstimateEvent[] {
  const out: EstimateEvent[] = [];
  for (const r of rows) {
    if (r.deleted === true) continue;
    const id = String(r.id ?? r._id ?? "").trim();
    const contactId = String(r.contactId ?? "").trim();
    if (!id || !contactId) continue;
    out.push({
      id,
      contactId,
      startTime: String(r.startTime ?? ""),
      status: String(r.appointmentStatus ?? r.appoinmentStatus ?? r.status ?? "booked").toLowerCase(),
    });
  }
  return out;
}

export async function loadEstimateContacts(
  gctx: GhlContext,
  calendarId: string,
  nowMs: number,
): Promise<Set<string>> {
  const from = nowMs - EVENT_WINDOW_DAYS * 86_400_000;
  const to = nowMs + EVENT_WINDOW_DAYS * 86_400_000;
  const data = await ghlJson<{ events?: Record<string, unknown>[] }>(
    gctx,
    `/calendars/events?locationId=${encodeURIComponent(gctx.locationId)}&calendarId=${encodeURIComponent(calendarId)}&startTime=${from}&endTime=${to}`,
  );
  return new Set(toEstimateEvents(data.events ?? []).map((e) => e.contactId));
}
