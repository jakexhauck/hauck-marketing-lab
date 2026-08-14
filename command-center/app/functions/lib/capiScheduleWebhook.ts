import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import type { GhlContext } from "./ghl";
import type { GhlWebhookEvent } from "./ghlEvents";
import { resolveGhlCreds } from "./tenantResolve";
import { funnelForTenantSlug, funnelKeyForTenantSlug } from "./metaCapi";
import { resolveMetaToken } from "./metaToken";
import { isRealBooking, reportBooking, toAppointment } from "./capiSchedule";

// The webhook half of "tell Meta the lead booked".
//
// Kept out of api/webhook.ts because that file is already long and this is a
// self-contained side effect; kept out of capiSchedule.ts because that module
// is pure of Env and tenant lookups, which makes it testable.
//
// Only AppointmentCreate reports a booking. An update is a reschedule of a
// booking Meta already counted, and a delete is a cancellation, which Meta's
// Conversions API has no honest way to retract: sending a second Schedule on
// every update would inflate the client's conversions every time somebody moved
// an appointment by ten minutes.
const BOOKING_TYPES = new Set(["AppointmentCreate"]);

export async function reportBookingFromWebhook(
  env: Env,
  client: SupabaseClient,
  tenantId: string,
  event: GhlWebhookEvent,
): Promise<void> {
  if (!BOOKING_TYPES.has(String(event.type ?? ""))) return;

  const token = await resolveMetaToken(env);
  if (!token) return;

  const { data } = await client
    .from("tenants")
    .select("id, slug, name, ghl_token, ghl_location_id, ghl_app_installed")
    .eq("id", tenantId)
    .maybeSingle();
  if (!data) return;

  const tenant = data as Record<string, unknown>;
  const funnel = funnelForTenantSlug(tenant.slug as string | null);
  const funnelKey = funnelKeyForTenantSlug(tenant.slug as string | null);
  // A client whose ads do not run through one of our funnels has no pixel to
  // report into, and guessing one would write a conversion into somebody
  // else's account.
  if (!funnel || !funnelKey) return;

  const creds = resolveGhlCreds(tenant as never);
  if (!creds) return;
  const gctx: GhlContext = { token: creds.token, locationId: creds.locationId };

  // GHL nests the appointment on marketplace payloads and flattens it on
  // workflow ones, the same split appointmentMirror.ts deals with.
  const raw = ((event.appointment ?? event) as Record<string, unknown>) ?? {};
  if (!isRealBooking(raw)) return;
  const appt = toAppointment(raw);
  if (!appt) return;

  await reportBooking(client, token, funnelKey, funnel, gctx, appt, tenantId);
}
