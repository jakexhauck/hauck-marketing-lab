import type { SupabaseClient } from "@supabase/supabase-js";
import { testTenantSlug, type Env } from "./env";
import { composioUserId, getBusy, getBusyEvents, getConnection } from "./googleCalendar";

// The Google Calendar a client linked in their own app (Composio, keyed
// `${mode}:${slug}`, see googleCalendar.ts), read for Client > Setting so Jake
// never books an estimate over something the owner already has on.

export interface ClientGoogle {
  connected: boolean;
  events: { title: string; start: string; end: string }[];
}

export async function clientGoogleBusy(
  env: Env,
  client: SupabaseClient,
  tenantId: string,
  startMs: number,
  endMs: number,
  zone: string,
): Promise<ClientGoogle> {
  const { data } = await client.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
  const slug = (data?.slug as string | undefined) ?? "";
  if (!slug) return { connected: false, events: [] };
  const user = composioUserId({ slug, mode: slug === testTenantSlug(env) ? "test" : "live" });

  const conn = await getConnection(env, user);
  if (!conn.connected) return { connected: false, events: [] };
  const range = { timeMin: new Date(startMs).toISOString(), timeMax: new Date(endMs).toISOString() };
  let events: { title?: string; start: string; end: string }[] = await getBusyEvents(env, user, range);
  // Same fallback as the Setter Suite: an empty titled read degrades to the
  // anonymous freebusy read, never to a calendar that lost its busy hours.
  if (events.length === 0) events = await getBusy(env, user, { ...range, timezone: zone });
  return { connected: true, events: events.map((e) => ({ title: e.title || "Busy", start: e.start, end: e.end })) };
}

// Open slots that do not collide with a busy block. `minutes` is the slot length.
export function dropBusySlots(slots: string[], busy: { start: string; end: string }[], minutes: number): string[] {
  const blocks = busy.map((b) => [+new Date(b.start), +new Date(b.end)] as const);
  return slots.filter((s) => {
    const t = +new Date(s);
    return Number.isFinite(t) && !blocks.some(([a, b]) => t < b && t + minutes * 60_000 > a);
  });
}
