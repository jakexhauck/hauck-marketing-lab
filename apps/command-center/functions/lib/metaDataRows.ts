import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAllPages } from "./pagedSelect";

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
  // Paged: `.limit(5000)` here was a promise PostgREST never kept. It caps a
  // read at 1000 rows regardless, silently, so past 1000 ad-days this tab
  // would have lost its oldest rows without a word.
  let data: Record<string, unknown>[];
  try {
    data = await selectAllPages<Record<string, unknown>>((from, to) =>
      client
        .from("meta_ad_days")
        .select(`id, ${COLUMNS}`)
        .eq("tenant_id", tenantId)
        .order("date", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    );
  } catch (err) {
    return { error: (err as Error).message };
  }

  const rows: MetaDataRow[] = data.map((r) => ({
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
