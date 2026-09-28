import type { Env } from "./env";
import { getServiceClient } from "./supabase";
import { loadTenantById } from "./tenantResolve";
import { resolveMetaToken } from "./metaToken";

// Where an admin creative upload goes: the named client's OWN ad account, with
// the agency token. Never the env META_AD_ACCOUNT_ID fallback: that names a real
// client, and an upload that inherited it would put one client's creatives in
// another client's library. A client with no account gets a refusal instead.
export async function resolveUploadTarget(
  env: Env,
  tenantId: string,
): Promise<{ token: string; account: string } | Response> {
  const client = getServiceClient(env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const tenant = await loadTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });
  const account = (tenant.meta_ad_account_id ?? "").trim();
  if (!account) {
    return Response.json({ error: "This client has no Meta ad account linked." }, { status: 409 });
  }
  const token = await resolveMetaToken(env);
  if (!token) return Response.json({ error: "Meta is not connected." }, { status: 503 });
  return { token, account };
}
