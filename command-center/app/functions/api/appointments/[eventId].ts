import type { Env, ApiData } from "../../lib/env";
import { readJsonBody } from "../../lib/body";
import { type GhlContext } from "../../lib/ghl";
import { rescheduleAppointment } from "../lib/appointments";
import { mirrorAppointment, composioUserId } from "../../lib/googleCalendar";

// PUT /api/appointments/:eventId: reschedule an existing appointment to a new
// start/end. Confirmed shape against Willis. Idempotent, so a retry is safe.
//
// Body: { startTime, endTime }

interface RescheduleBody {
  startTime?: string;
  endTime?: string;
}

export const onRequestPut: PagesFunction<Env, "eventId", ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const eventId = ctx.params.eventId as string;

  const body = await readJsonBody<RescheduleBody>(ctx.request);
  if (!body || !body.startTime || !body.endTime) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await rescheduleAppointment(
    gctx,
    eventId,
    body.startTime,
    body.endTime,
  );
  if (!result.ok) {
    return Response.json(
      { error: "ghl_error", status: result.status, body: result.body },
      { status: 502 },
    );
  }

  // Move the mirrored event too, if the client has linked a calendar. The
  // appointment id stamped on the Google event is what makes this a move rather
  // than a second event appearing. Best effort: the reschedule already
  // succeeded in the system of record.
  ctx.waitUntil(
    mirrorAppointment(ctx.env, composioUserId(t), {
      appointmentId: eventId,
      title: "Job",
      startIso: body.startTime,
      endIso: body.endTime,
    }).catch((e) => {
      console.error("google calendar mirror failed", e);
    }),
  );

  return Response.json({ ok: true });
};
