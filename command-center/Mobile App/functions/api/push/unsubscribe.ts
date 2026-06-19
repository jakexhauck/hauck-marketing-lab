import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";

interface UnsubscribeBody {
  subscription?: { endpoint?: string };
  endpoint?: string;
}

// Remove a Web Push subscription for the session's tenant, keyed by
// (tenant_id, endpoint). Accepts either a raw endpoint or a full subscription.
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (
  ctx,
) => {
  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  let body: UnsubscribeBody = {};
  try {
    body = (await ctx.request.json()) as UnsubscribeBody;
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const endpoint = body.endpoint ?? body.subscription?.endpoint;
  if (!endpoint) {
    return Response.json({ error: "missing_endpoint" }, { status: 400 });
  }

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) {
    return Response.json({ error: "tenant_not_found" }, { status: 500 });
  }

  const { error } = await client
    .from("push_subscriptions")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("endpoint", endpoint);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
};
