import type { Env } from "./env";
import type { GhlContext } from "./ghl";
import { getServiceClient } from "./supabase";
import { loadTenantById } from "./tenantResolve";
import { appMinter, resolveTenantGhl } from "./ghlCreds";
import type { SupabaseClient } from "@supabase/supabase-js";

// The client and its GHL creds for every Client > Setting endpoint. Creds are
// resolved the way the live middleware does, never tenant.ghl_token raw.
export type SettingTenant = { client: SupabaseClient; slug: string; locationId: string; gctx: GhlContext };

export async function settingTenant(env: Env, tenantId: string): Promise<SettingTenant | Response> {
  const client = getServiceClient(env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });
  const creds = await resolveTenantGhl(tenant, appMinter(client, env));
  if (!creds) return Response.json({ error: "GHL not connected" }, { status: 503 });
  return {
    client,
    slug: tenant.slug,
    locationId: creds.locationId,
    gctx: { token: creds.token, locationId: creds.locationId },
  };
}
