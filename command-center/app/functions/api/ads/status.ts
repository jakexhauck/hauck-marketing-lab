import type { Env, ApiData } from "../../lib/env";
import { getServiceClient } from "../../lib/supabase";
import { resolveMetaToken } from "../../lib/metaToken";
import { loadAdsStatus } from "../../lib/adsStatus";

// GET /api/ads/status -> AdsStatus for the SESSION tenant.
//
// Every Paid Ads page asks this first. Not launched: the page shows "coming
// soon" and never fetches a number. Launched: the answer arrives only after a
// stale snapshot has been re-synced and re-proven against Meta (lib/adsStatus),
// so the tracker the page loads next reads fresh, verified rows.

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const { data: tenant, error } = await client
    .from("tenants")
    .select("id, name, meta_ad_account_id, meta_timezone")
    .eq("slug", ctx.data.tenant.slug)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!tenant) return Response.json({ error: "tenant not found" }, { status: 404 });

  try {
    const token = await resolveMetaToken(ctx.env);
    return Response.json(await loadAdsStatus(client, tenant, token));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
};
