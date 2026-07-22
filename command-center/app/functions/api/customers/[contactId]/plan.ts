import type { Env, ApiData } from "../../../lib/env";
import { readJsonBody } from "../../../lib/body";
import { getServiceClient, resolveTenantId } from "../../../lib/supabase";
import type { GhlContext } from "../../../lib/ghl";
import {
  resolveCalendarByName,
  createAppointment,
  rescheduleAppointment,
} from "../../lib/appointments";

// PUT /api/customers/:contactId/plan — set, move, or clear the next service.
//
// The one rule worth knowing: if we already hold an appointment id, a new date
// RESCHEDULES it. Booking again would leave the old slot on the calendar and
// double-book the crew, which is the kind of bug the client finds out about by
// turning up at the wrong house.

const SERVICE_CALENDAR = "window cleaning";
const SERVICE_DURATION_MS = 3 * 60 * 60_000;

interface PlanBody {
  mode: "book" | "unplanned" | "none";
  at?: string;
}

export const onRequestPut: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const t = ctx.data.tenant;
  const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
  const contactId = ctx.params.contactId as string;
  const body = await readJsonBody<PlanBody>(ctx.request);
  if (!body?.mode) return Response.json({ error: "missing_fields" }, { status: 400 });

  const client = getServiceClient(ctx.env);
  const tenantId = client ? await resolveTenantId(client, t.slug) : null;
  if (!client || !tenantId) {
    return Response.json({ error: "jobs_unavailable" }, { status: 503 });
  }

  const { data: existing } = await client
    .from("customer_service_plan")
    .select("ghl_appointment_id")
    .eq("tenant_id", tenantId)
    .eq("ghl_contact_id", contactId)
    .maybeSingle();
  const heldAppointmentId =
    (existing as { ghl_appointment_id: string | null } | null)?.ghl_appointment_id ?? null;

  if (body.mode !== "book") {
    // Dropping the date: the appointment behind it should go too, but a calendar
    // failure must not strand our row. Clear ours either way and say what
    // happened, rather than refusing and leaving the client stuck.
    let calendarError: string | undefined;
    if (heldAppointmentId) {
      const res = await cancelAppointment(gctx, heldAppointmentId);
      if (!res.ok) calendarError = "The calendar booking could not be cancelled. Remove it in your calendar.";
    }
    await client.from("customer_service_plan").upsert(
      {
        tenant_id: tenantId,
        ghl_contact_id: contactId,
        next_service_at: null,
        status: body.mode,
        ghl_appointment_id: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,ghl_contact_id" },
    );
    return Response.json({ ok: true, ...(calendarError ? { calendarError } : {}) });
  }

  if (!body.at) return Response.json({ error: "next_service_date_required" }, { status: 400 });
  const start = new Date(body.at);
  if (Number.isNaN(start.getTime())) {
    return Response.json({ error: "invalid_date" }, { status: 400 });
  }
  if (start.getTime() < Date.now()) {
    return Response.json({ error: "next_service_in_past" }, { status: 400 });
  }
  const end = new Date(start.getTime() + SERVICE_DURATION_MS);

  let appointmentId = heldAppointmentId;
  let calendarError: string | undefined;

  if (heldAppointmentId) {
    const res = await rescheduleAppointment(
      gctx,
      heldAppointmentId,
      start.toISOString(),
      end.toISOString(),
    );
    if (!res.ok) {
      calendarError = `The calendar rejected the change (${res.status}).`;
      appointmentId = null;
    }
  } else {
    const calendarId = await resolveCalendarByName(gctx, SERVICE_CALENDAR);
    if (!calendarId) {
      calendarError = "No service calendar found to book on.";
    } else {
      const res = await createAppointment(gctx, {
        calendarId,
        contactId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        title: "Recurring service",
      });
      if (res.ok) appointmentId = res.id;
      else {
        calendarError = res.needsStaff
          ? "That calendar has no team members assigned, so nothing could be booked."
          : `The calendar rejected the booking (${res.status}).`;
      }
    }
  }

  await client.from("customer_service_plan").upsert(
    {
      tenant_id: tenantId,
      ghl_contact_id: contactId,
      next_service_at: body.at,
      // No appointment behind the date means it is not really booked. Storing
      // "booked" here would have the page claim a calendar slot that does not
      // exist; serviceStateFor reads this back as amber instead.
      status: appointmentId ? "booked" : "unplanned",
      ghl_appointment_id: appointmentId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,ghl_contact_id" },
  );

  return Response.json({ ok: true, ...(calendarError ? { calendarError } : {}) });
};

// GHL cancels an appointment by setting its status, not by DELETE.
async function cancelAppointment(
  gctx: GhlContext,
  eventId: string,
): Promise<{ ok: boolean }> {
  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/calendars/events/appointments/${encodeURIComponent(eventId)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${gctx.token}`,
          Version: "2021-04-15",
          Accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ appointmentStatus: "cancelled" }),
      },
    );
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
