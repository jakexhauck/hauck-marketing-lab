import type { Env } from "./env";
import { getServiceClient } from "./supabase";
import type { GhlContext } from "./ghl";

const PLACEHOLDERS = new Set(["", "pending", "env"]);

export function isPlaceholder(v: string | null | undefined): boolean {
  return v == null || PLACEHOLDERS.has(v.trim().toLowerCase());
}

export class TenantGhlError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

// Admin routes run above tenant resolution (functions/api/_middleware.ts:87-100),
// so ctx.data.tenant is never populated. This is the one place that turns a
// tenantId into a usable GHL context for those routes. Note getTenantById in
// adminAuth.ts deliberately omits ghl_token, so it cannot be used here.
//
// Deliberate divergence from resolveGhlCreds in tenantResolve.ts: that helper
// falls back to the GHL_LOCATION_ID / GHL_TOKEN env vars when a tenant's stored
// creds are placeholders, because it backs the live client app where "show the
// env sub-account" is an acceptable degrade. The env vars hold a real
// production client's credentials. Admin tooling built on this helper (the
// Setter Suite client switcher) WRITES: it applies tags that fire live
// automations. If an admin picked a half-configured client and this fell back
// to the env creds, it would silently tag a different client's real customers.
// So this throws instead of falling back. Do not change this to match
// resolveGhlCreds; the two helpers serve different trust boundaries on
// purpose.
export async function getGhlContextForTenant(env: Env, tenantId: string): Promise<GhlContext> {
  const client = getServiceClient(env);
  // getServiceClient returns null when Supabase env vars are unset. Every
  // current caller already checks this itself before reaching here, but
  // TypeScript cannot see that, and a future caller might not: fail loudly
  // rather than crash on client.from below.
  if (!client) throw new TenantGhlError(503, "supabase_not_configured", "Client data is not available right now.");
  const { data, error } = await client
    .from("tenants")
    .select("ghl_location_id, ghl_token")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) throw new TenantGhlError(500, "tenant_lookup_failed", error.message);
  if (!data) throw new TenantGhlError(404, "tenant_not_found", "No such client.");
  if (isPlaceholder(data.ghl_location_id) || isPlaceholder(data.ghl_token)) {
    throw new TenantGhlError(400, "ghl_not_connected", "Connect this client to the booking system first.");
  }
  return { token: data.ghl_token, locationId: data.ghl_location_id };
}
