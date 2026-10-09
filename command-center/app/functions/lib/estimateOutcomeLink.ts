import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import type { GhlContext } from "./ghl";
import { getServiceClient } from "./supabase";
import { appMinter, resolveTenantGhl } from "./ghlCreds";
import { keysMatch, linkKey, parseCallNowParams } from "./callNow";
import { OUTCOME_KEY_PURPOSE } from "./estimateOutcome";
import { loadEstimateCalendars, type EstimateCalendars } from "./estimateTracking";

// Everything both outcome routes (the page and its time slots) need from the
// link: the key checked, the client found, their GoHighLevel key minted and
// their estimate and job calendars found by name.

// The zone a client's times are shown and booked in when no ad sync has
// recorded one yet. Every client so far is Eastern.
const FALLBACK_ZONE = "America/New_York";

export interface OutcomeLink {
  client: SupabaseClient;
  tenantId: string;
  gctx: GhlContext;
  contactId: string;
  appointmentId: string | null;
  calendars: EstimateCalendars;
  zone: string;
  // "?l=..&c=..&k=.." exactly as the link carried it, for the page's own calls.
  query: string;
}

export type LinkFailure = { status: number; message: string };

export async function resolveOutcomeLink(env: Env, url: URL): Promise<OutcomeLink | LinkFailure> {
  const bad = { status: 400, message: "This link is not valid." };
  const secret = (env.SESSION_SECRET ?? "").trim();
  const params = parseCallNowParams(url);
  if (!secret || !params) return bad;
  if (!keysMatch(params.key, await linkKey(secret, OUTCOME_KEY_PURPOSE, params.locationId))) return bad;

  const client = getServiceClient(env);
  if (!client) return { status: 503, message: "Something went wrong. Try again." };

  const { data: tenant } = await client
    .from("tenants")
    .select("id, ghl_location_id, ghl_token, meta_timezone")
    .eq("ghl_location_id", params.locationId)
    .maybeSingle();
  if (!tenant) return bad;
  const creds = await resolveTenantGhl(tenant, appMinter(client, env));
  if (!creds) return { status: 503, message: "Something went wrong. Try again." };
  const gctx: GhlContext = { token: creds.token, locationId: creds.locationId };

  const calendars = await loadEstimateCalendars(gctx).catch(() => null);
  if (!calendars) return { status: 404, message: "No estimate calendar in this account." };

  const a = (url.searchParams.get("a") ?? "").trim();
  return {
    client,
    tenantId: String(tenant.id),
    gctx,
    contactId: params.contactId,
    appointmentId: /^[A-Za-z0-9]{8,64}$/.test(a) ? a : null,
    calendars,
    zone: String(tenant.meta_timezone ?? "").trim() || FALLBACK_ZONE,
    query: `?l=${encodeURIComponent(params.locationId)}&c=${encodeURIComponent(params.contactId)}&k=${params.key}${
      a ? `&a=${encodeURIComponent(a)}` : ""
    }`,
  };
}

export function formatWhen(iso: string, zone: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(ms);
}
