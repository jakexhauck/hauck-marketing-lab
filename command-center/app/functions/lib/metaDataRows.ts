import type { SupabaseClient } from "@supabase/supabase-js";

// The META DATA payload: the raw daily, per-ad Meta snapshot exactly as stored
// in meta_ad_days. No GHL call, so this deliberately does NOT go through
// leadTrackerData.
//
// Shared by the client's own /api/ads/meta-data and the admin cockpit's
// /api/admin/clients/:tenantId/ads/meta-data. CTR / CPM / weekday are derived on
// the client, the way the sheet recomputed them rather than storing them.

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

const COLUMNS =
  "date, spend, impressions, reach, link_clicks, campaign_name, campaign_id, adset_name, adset_id, ad_name, ad_id";

export async function loadMetaDataRows(
  client: SupabaseClient,
  tenantId: string,
): Promise<{ rows: MetaDataRow[] } | { error: string }> {
  const res = await client
    .from("meta_ad_days")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .order("date", { ascending: false })
    .limit(5000);

  if (res.error) return { error: res.error.message };

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

  return { rows };
}
