import type { Env, ApiData } from "../../lib/env";
import type { TenantsResponse } from "../../../src/lib/agentWire";
import { getServiceClient } from "../../lib/supabase";
import { isNotAClient } from "../../lib/retiredTenant";
import { tenantFromRow } from "../../lib/agentRunner";

// GET /api/agent-runner/tenants -> TenantsResponse
//
// Every real client, for the startup check to walk. The same rule as every
// admin client list (lib/retiredTenant.ts): retired accounts and Hauck
// Marketing's own sub-account are not clients.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const { data, error } = await client
    .from("tenants")
    .select("id, name, slug, meta_ad_account_id")
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const out: TenantsResponse = ((data ?? []) as Record<string, unknown>[])
    .filter((t) => !isNotAClient(t as { name?: string; slug?: string }))
    .map(tenantFromRow);
  return Response.json(out);
};
