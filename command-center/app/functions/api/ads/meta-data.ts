import type { Env, ApiData } from "../../lib/env";
import { getServiceClient, resolveTenantId } from "../../lib/supabase";

// GET /api/ads/meta-data -> { rows, currency }
//
// The sheet's META DATA tab: the raw daily, per-ad Meta snapshot, exactly as
// stored in meta_ad_days. No GHL call. CTR / CPM / weekday are derived on the
// client, the way the sheet recomputed them rather than storing them.

export interface MetaDataRow {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  linkClicks: number;
  campaignName: string;
  campaignId: string;
  adsetName: string;
  adsetId: string;
  adName: string;
  adId: string;
}

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown) => (typeof v === "string" ? v : "");

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const client = getServiceClient(ctx.env);
  if (!client) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const t = ctx.data.tenant;
  const tenantId = await resolveTenantId(client, t.slug);
  if (!tenantId) return Response.json({ error: "tenant not found" }, { status: 404 });

  const res = await client
    .from("meta_ad_days")
    .select(
      "date, spend, impressions, reach, link_clicks, campaign_name, campaign_id, adset_name, adset_id, ad_name, ad_id",
    )
    .eq("tenant_id", tenantId)
    .order("date", { ascending: false })
    .limit(5000);

  if (res.error) return Response.json({ error: res.error.message }, { status: 500 });

  const rows: MetaDataRow[] = (res.data ?? []).map((r) => ({
    date: str(r.date),
    spend: num(r.spend),
    impressions: num(r.impressions),
    reach: num(r.reach),
    linkClicks: num(r.link_clicks),
    campaignName: str(r.campaign_name),
    campaignId: str(r.campaign_id),
    adsetName: str(r.adset_name),
    adsetId: str(r.adset_id),
    adName: str(r.ad_name),
    adId: str(r.ad_id),
  }));

  return Response.json({ rows, currency: "USD" });
};
