import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";

// The browser PushSubscription, as serialized by sub.toJSON() on the client.
interface SubscribeBody {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
}

// Store / refresh a Web Push subscription for the test-account tenant. The
// browser PushSubscription is mapped onto the split columns (endpoint, p256dh,
// auth), not a single jsonb blob, and upserted on (tenant_id, endpoint).
export const onRequestPost: PagesFunction<Env, string, ApiData> = async (
  ctx,
) => {
  const client = getServiceClient(ctx.env);
  if (!client) {
    return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  let body: SubscribeBody = {};
  try {
    body = (await ctx.request.json()) as SubscribeBody;
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const sub = body.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return Response.json({ error: "invalid_subscription" }, { status: 400 });
  }

  const tenantId = await resolveTenantId(client, "test-account");
  if (!tenantId) {
    return Response.json({ error: "tenant_not_found" }, { status: 500 });
  }

  // Optional identity header. Fine to leave null on a shared-password device.
  const ghlUserId = ctx.request.headers.get("x-identity");

  const { error } = await client.from("push_subscriptions").upsert(
    {
      tenant_id: tenantId,
      endpoint,
      p256dh,
      auth,
      ghl_user_id: ghlUserId,
    },
    { onConflict: "tenant_id,endpoint" },
  );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
};
