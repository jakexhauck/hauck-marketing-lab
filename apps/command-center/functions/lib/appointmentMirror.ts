import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import {
  composioUserId,
  mirrorAppointment,
  unmirrorAppointment,
} from "./googleCalendar";
import type { GhlWebhookEvent } from "./ghlEvents";

// Putting every GoHighLevel appointment into the client's own Google Calendar.
//
// mirrorAppointment already existed, but it only ran from /api/appointments,
// which is bookings made THROUGH our app. An appointment booked on a GHL
// booking widget, or by the agency inside GHL, never reached it, and those are
// most of them. This is the webhook side, so a booking mirrors wherever it was
// made.
//
// Cancellation had no path at all until now: a deleted GHL appointment sat in
// the owner's diary forever, which is worse than never mirroring it, because
// they plan their day around a job that is not happening.
//
// Everything here is best effort and off the response path. The booking has
// already succeeded in the system of record by the time this runs.

const CREATE_TYPES = new Set(["AppointmentCreate", "AppointmentUpdate"]);
const DELETE_TYPES = new Set(["AppointmentDelete"]);

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface MirrorFields {
  appointmentId: string;
  title: string;
  startIso: string;
  endIso: string;
  location?: string;
}

// Exported for tests. GHL nests appointment data under `appointment` on
// marketplace payloads and flattens it on workflow ones, and the time fields
// have carried at least three names between them, so every reader here accepts
// several candidates and the caller drops what it cannot understand. The same
// looseness, for the same reason, as api/social/_lib.ts.
export function readMirrorFields(e: GhlWebhookEvent): MirrorFields | null {
  const appt = (e.appointment ?? {}) as Record<string, unknown>;

  const appointmentId = str(appt.id) || str(e.appointmentId) || str(e.id);
  const startIso = str(appt.startTime) || str(e.startTime) || str(appt.start_time);
  const endIso = str(appt.endTime) || str(e.endTime) || str(appt.end_time);

  // Without an id there is nothing to update or delete later, and without both
  // times there is no event to write. Either way, skip rather than guess: a
  // mirrored event at the wrong time is worse than no mirrored event.
  if (!appointmentId || !startIso || !endIso) return null;

  return {
    appointmentId,
    title: str(appt.title) || str(e.title) || "Appointment",
    startIso,
    endIso,
    location: str(appt.address) || str(e.address) || undefined,
  };
}

// Handle one webhook event. A no-op for every type that is not an appointment,
// and for every client who has not linked a calendar.
export async function mirrorFromWebhook(
  env: Env,
  client: SupabaseClient,
  tenantId: string,
  event: GhlWebhookEvent,
): Promise<void> {
  const type = str(event.type);
  const isCreate = CREATE_TYPES.has(type);
  const isDelete = DELETE_TYPES.has(type);
  if (!isCreate && !isDelete) return;

  const { data } = await client
    .from("tenants")
    .select("slug")
    .eq("id", tenantId)
    .maybeSingle();
  const slug = str(data?.slug);
  if (!slug) return;

  // Live mode only. A test workspace must never write into the calendar the
  // client actually runs their day from.
  const userId = composioUserId({ slug, mode: "live" });

  const fields = readMirrorFields(event);
  if (!fields) return;

  if (isDelete) {
    await unmirrorAppointment(env, userId, fields.appointmentId);
    return;
  }
  await mirrorAppointment(env, userId, fields);
}
