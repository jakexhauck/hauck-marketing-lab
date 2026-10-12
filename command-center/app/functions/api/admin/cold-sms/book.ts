import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { ghlFetch } from "../../../lib/ghl";
import { getAgencyGhlContext, isAgencyGhlConfigured } from "../../../lib/agencyGhl";
import { createAppointment, getCalendar, isCalendarNotFound, listCalendars } from "../../lib/appointments";
import { pickColdSmsCalendar } from "../../../lib/coldSmsBoard";

// POST /api/admin/cold-sms/book  (owner only)
// { contactId, startTime, firstName?, lastName?, email?, business?, timezone?, notes? }
//
// The booking wizard's last step. In order:
//   1. The contact's details as typed in step 2, plus their timezone, so GHL's
//      confirmation and reminder texts quote THEIR local time.
//   2. The appointment on the Cold SMS calendar (pickColdSmsCalendar). The end comes from the
//      calendar's own slot length, never from the browser.
//   3. The notes, as a contact note.
//
// The card is NOT moved: Jake's GHL workflow moves it to Sales > Call Booked when
// the appointment lands (Jake, 2026-10-12). Two systems moving one card is how a
// pipeline ends up lying.
//
// Step 1 failing does not stop the booking (a meeting with a stale name beats no
// meeting); step 2 failing stops everything after it. Never retried: a resent
// booking double-books a real slot.

interface Body {
  contactId?: unknown;
  startTime?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  business?: unknown;
  timezone?: unknown;
  notes?: unknown;
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function validZone(z: string): boolean {
  if (!z) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: z });
    return true;
  } catch {
    return false;
  }
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!isAgencyGhlConfigured(ctx.env)) return Response.json({ error: "not_configured" }, { status: 503 });
  const body = await readJsonBody<Body>(ctx.request);
  const contactId = str(body?.contactId, 64);
  const start = +new Date(str(body?.startTime, 64));
  if (!contactId) return Response.json({ error: "missing_contact_id" }, { status: 400 });
  if (!Number.isFinite(start)) return Response.json({ error: "bad_start" }, { status: 400 });
  if (start < Date.now()) return Response.json({ error: "in_the_past" }, { status: 400 });

  const email = str(body?.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "bad_email" }, { status: 400 });
  }
  const timezone = str(body?.timezone, 64);

  const agency = getAgencyGhlContext(ctx.env);
  let calendar;
  try {
    calendar = pickColdSmsCalendar(await listCalendars(agency));
  } catch {
    return Response.json({ error: "ghl_unavailable" }, { status: 502 });
  }
  if (!calendar) return Response.json({ error: "calendar_not_found" }, { status: 422 });
  const detail = await getCalendar(agency, calendar.id);
  const mins = (detail?.slotDuration ?? 30) * (/hour/i.test(detail?.slotDurationUnit ?? "") ? 60 : 1);

  // 1. Contact details. Only what was actually typed; blank leaves GHL alone.
  const update: Record<string, string> = {};
  const first = str(body?.firstName);
  const last = str(body?.lastName);
  const business = str(body?.business);
  if (first) update.firstName = first;
  if (last) update.lastName = last;
  if (email) update.email = email;
  if (business) update.companyName = business;
  if (validZone(timezone)) update.timezone = timezone;
  if (Object.keys(update).length) {
    const r = await ghlFetch(agency, `/contacts/${encodeURIComponent(contactId)}`, {
      method: "PUT",
      body: JSON.stringify(update),
    });
    if (!r.ok) console.warn("[cold-sms/book] contact update", r.status, (await r.text()).slice(0, 200));
  }

  // 2. The appointment.
  const appt = await createAppointment(agency, {
    calendarId: calendar.id,
    contactId,
    startTime: new Date(start).toISOString(),
    endTime: new Date(start + mins * 60_000).toISOString(),
  });
  if (!appt.ok) {
    console.error("[cold-sms/book] appointment", appt.status, appt.body);
    if (appt.needsStaff) return Response.json({ error: "needs_staff" }, { status: 422 });
    if (isCalendarNotFound(appt.status, appt.body)) return Response.json({ error: "calendar_not_found" }, { status: 422 });
    if (/slot|not available|already booked/i.test(appt.body)) {
      return Response.json({ error: "slot_taken" }, { status: 409 });
    }
    return Response.json({ error: "book_failed" }, { status: 502 });
  }

  // 3. Notes. Best effort: the meeting is real whether or not this lands.
  const notes = str(body?.notes, 4000);
  if (notes) {
    const n = await ghlFetch(agency, `/contacts/${encodeURIComponent(contactId)}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: notes }),
    });
    if (!n.ok) console.warn("[cold-sms/book] note", n.status);
  }

  return Response.json({
    ok: true,
    appointmentId: appt.id,
    startTime: new Date(start).toISOString(),
    endTime: new Date(start + mins * 60_000).toISOString(),
    calendarName: calendar.name ?? "",
  });
};
