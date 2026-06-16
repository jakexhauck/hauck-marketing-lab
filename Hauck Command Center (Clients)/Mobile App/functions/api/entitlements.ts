import type { Env, ApiData } from "../lib/env";
import { getServiceClient, resolveTenantId } from "../lib/supabase";
import { loadEnabledCapabilities } from "../lib/permissions";

// GET /api/entitlements
// The capabilities the current business has turned on. Bounds the toggles the
// owner sees on the Team screen. Owner-only: only owners manage staff.
export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  if (!ctx.data.isOwner) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) return Response.json({ error: "tenant not found" }, { status: 404 });

  const capabilities = await loadEnabledCapabilities(client, tenantId);
  return Response.json({ capabilities });
};
