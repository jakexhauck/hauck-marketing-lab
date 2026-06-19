import type { Env, ApiData } from "../../../../lib/env";
import { getServiceClient } from "../../../../lib/supabase";
import { getTenantById, logAdminAction } from "../../../../lib/adminAuth";
import { isCapability, loadEnabledCapabilities } from "../../../../lib/permissions";

interface PatchBody {
  capability?: string;
  enabled?: boolean;
}

// PATCH /api/admin/clients/:tenantId/entitlements  (admin-only)
// Turn one capability on or off for a client (Layer 2). Disabling a capability
// instantly revokes it for every staff member of that client, because the
// middleware re-checks entitlements on each request. Returns the new enabled set.
export const onRequestPatch: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const tenantId = ctx.params.tenantId as string;
  const tenant = await getTenantById(client, tenantId);
  if (!tenant) return Response.json({ error: "client not found" }, { status: 404 });

  let body: PatchBody = {};
  try {
    body = (await ctx.request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const capability = (body.capability ?? "").trim();
  if (!isCapability(capability)) {
    return Response.json({ error: "unknown capability" }, { status: 400 });
  }
  const enabled = Boolean(body.enabled);

  const { error } = await client
    .from("tenant_entitlements")
    .upsert(
      { tenant_id: tenantId, capability, enabled },
      { onConflict: "tenant_id,capability" },
    );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await logAdminAction(client, ctx.data.admin!.id, "client.entitlement", tenantId, {
    capability,
    enabled,
  });

  const capabilities = await loadEnabledCapabilities(client, tenantId);
  return Response.json({ ok: true, capabilities });
};
