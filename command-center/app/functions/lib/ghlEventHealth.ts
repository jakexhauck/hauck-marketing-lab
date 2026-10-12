import type { SupabaseClient } from "@supabase/supabase-js";

// The health board's write side, plus the cutover switch both webhook
// endpoints read.
//
// Everything here is best-effort. A failure to record that an event arrived
// must never stop the event being processed: the board going stale is a
// cosmetic problem, a dropped lead is not.

export type EventSource = "workflow" | "app";

// Record that GHL sent this event type for this tenant, whatever we then did
// with it. Unrecognised types are recorded too, on purpose: an event arriving
// and being dropped by the normalizer looks identical to an event never
// arriving at all if you only measure activity_log.
export async function bumpEventSeen(
  client: SupabaseClient,
  tenantId: string,
  eventType: string,
  source: EventSource,
): Promise<void> {
  if (!eventType) return;
  const { error } = await client.rpc("ghl_event_seen_bump", {
    p_tenant_id: tenantId,
    p_event_type: eventType,
    p_source: source,
  });
  if (error) {
    console.warn("[event-health] bump failed:", error.message);
  }
}

// Which source this tenant's reporting is cut over to. Defaults to 'app'
// (Jake, 2026-10-12): every client is connected through our Marketplace app,
// and the old workflow webhooks pointed at a dead domain. Only a row that says
// 'workflow' outright (the agency's own sub-account) stays on it.
export async function eventSourceForTenant(
  client: SupabaseClient,
  tenantId: string,
): Promise<EventSource> {
  const { data, error } = await client
    .from("tenants")
    .select("ghl_event_source")
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !data) return "app";
  return data.ghl_event_source === "workflow" ? "workflow" : "app";
}
