import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";

// The browser PushSubscription, as serialized by sub.toJSON() on the client.
interface SubscribeBody {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
}

// Hard ceiling on stored subscriptions per tenant. A real install is a handful
// of phones; anything past this is abuse or a refresh-loop bug filling the
// table with dead endpoints.
const MAX_SUBSCRIPTIONS_PER_TENANT = 50;

// Store / refresh a Web Push subscription for the session's tenant. The
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
  // Push payloads are POSTed to this URL on every webhook event, so an
  // attacker-chosen endpoint is an SSRF/beacon vector. Browsers only mint
  // https endpoints; reject everything else.
  if (!endpoint.startsWith("https://")) {
    return Response.json({ error: "invalid_endpoint" }, { status: 400 });
  }

  const tenantId = await resolveTenantId(client, ctx.data.tenant.slug);
  if (!tenantId) {
    return Response.json({ error: "tenant_not_found" }, { status: 500 });
  }

  const { count } = await client
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if ((count ?? 0) >= MAX_SUBSCRIPTIONS_PER_TENANT) {
    // At the cap, still allow refreshing an endpoint we already store.
    const { data: existing } = await client
      .from("push_subscriptions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("endpoint", endpoint)
      .maybeSingle();
    if (!existing) {
      return Response.json(
        { error: "too_many_subscriptions" },
        { status: 429 },
      );
    }
  }

  // Which GHL identity owns this device, for "assigned rep only" routing. A
  // staff (email+password) session knows it authoritatively; the shared-password
  // mobile app supplies the chosen identity via the x-identity header instead.
  // Fine to leave null: such a device only ever gets "everyone" pushes.
  const ghlUserId =
    ctx.data.staff?.ghl_user_id ?? ctx.request.headers.get("x-identity");

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
