import type { Env, ApiData } from "../../lib/env";
import { readJsonBody } from "../../lib/body";
import { type GhlContext } from "../../lib/ghl";
import {
  resolveCalendarByName,
  createAppointment,
} from "../lib/appointments";
import { mirrorAppointment, composioUserId } from "../../lib/googleCalendar";

// POST /api/appointments: book an appointment on a named calendar. The client
// sends a calendar NAME (e.g. "Home Estimate", "Intro Call") plus the chosen
// slot; the server resolves the calendar id by name per tenant so no id is
// hardcoded client-side. Terminal write, so it never retries.
//
// Body: { contactId, calendarName | calendarId, startTime, endTime, title? }
//
// Degrades honestly: a round-robin calendar with no team members returns 422
// { error: "needs_staff" } so the client shows "this calendar needs staff
// assigned" rather than a generic failure.

interface CreateBody {
  contactId?: string;
  calendarName?: string;
  calendarId?: string;
  startTime?: string;
  endTime?: string;
  title?: string;
}

export const onRequestPost: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };

  const body = await readJsonBody<CreateBody>(ctx.request);
  if (!body || !body.contactId || !body.startTime || !body.endTime) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  let calendarId = body.calendarId ?? null;
  if (!calendarId && body.calendarName) {
    calendarId = await resolveCalendarByName(gctx, body.calendarName);
  }
  if (!calendarId) {
    return Response.json(
      { error: "calendar_not_found", calendar: body.calendarName ?? null },
      { status: 422 },
    );
  }

  const result = await createAppointment(gctx, {
    calendarId,
    contactId: body.contactId,
    startTime: body.startTime,
    endTime: body.endTime,
    title: body.title,
  });

  if (!result.ok) {
    if (result.needsStaff) {
      return Response.json({ error: "needs_staff" }, { status: 422 });
    }
    return Response.json(
      { error: "ghl_error", status: result.status, body: result.body },
      { status: 502 },
    );
  }

  // Mirror into the client's own Google Calendar, if they have linked one.
  // Best effort and deliberately after the booking has already succeeded: the
  // appointment exists in the system of record either way, and most clients
  // have nothing linked, so a failure here must never fail the booking.
  ctx.waitUntil(
    mirrorAppointment(ctx.env, composioUserId(t), {
      appointmentId: result.id,
      title: body.title || "Job",
      startIso: body.startTime,
      endIso: body.endTime,
    }).catch((e) => {
      console.error("google calendar mirror failed", e);
    }),
  );

  return Response.json({ ok: true, id: result.id });
};
