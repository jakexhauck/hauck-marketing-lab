// The Meta side of the Ad Tracker: one row per ad per day, mirroring the
// sheet's META DATA tab (see docs/build-plans/ad-tracker-rebuild.md §7A).
//
// Replaces the Make scenario "AC: (Local Ads School) Client Meta Data Feed",
// with four deliberate differences:
//   1. Upsert on (tenant_id, date, ad_id), not blind append. Make appended, so
//      a retry or double-run double-counted spend silently.
//   2. Date from Meta's date_start, not now(). Make stamped the RUN date.
//   3. A trailing window, not just yesterday. Meta revises spend after the
//      fact and the original never looked back.
//   4. cpm is not requested. The sheet recomputed it anyway; so do we.

import { graphGetAll } from "./metaGraph";
import type { TrackerSpendRow } from "./adTrackerMetrics";

// The 10 fields we ask Meta for. Same set the Make scenario used, minus cpm.
// adset_id is the reason this table is worth having: GHL has no ad set id, so
// this snapshot is what resolves ad -> ad set -> campaign.
export const INSIGHT_FIELDS = [
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "spend",
  "impressions",
  "reach",
  "inline_link_clicks",
].join(",");

export const AD_DAY_COLUMNS = [
  "tenant_id",
  "date",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "spend",
  "impressions",
  "reach",
  "link_clicks",
].join(", ");

export interface MetaInsightRow {
  date_start?: string;
  date_stop?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
}

export interface AdDayUpsert {
  tenant_id: string;
  date: string;
  ad_id: string;
  ad_name: string;
  adset_id: string;
  adset_name: string;
  campaign_id: string;
  campaign_name: string;
  spend: number;
  impressions: number;
  reach: number;
  link_clicks: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Meta sends every metric as a string. A missing metric means "none", so it
// defaults to 0; a present but unparseable one means we misunderstand the
// response, so the row is dropped rather than written as NaN.
function metric(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function buildAdDayUpserts(
  rows: MetaInsightRow[],
  tenantId: string,
): AdDayUpsert[] {
  const out: AdDayUpsert[] = [];

  for (const row of rows) {
    const adId = text(row.ad_id).trim();
    const date = text(row.date_start).trim();
    // Both halves of the unique key must be real or the row cannot be keyed.
    if (!adId || !ISO_DATE.test(date)) continue;

    const spend = metric(row.spend);
    const impressions = metric(row.impressions);
    const reach = metric(row.reach);
    const linkClicks = metric(row.inline_link_clicks);
    if (spend === null || impressions === null || reach === null || linkClicks === null) {
      continue;
    }

    out.push({
      tenant_id: tenantId,
      date,
      ad_id: adId,
      ad_name: text(row.ad_name),
      adset_id: text(row.adset_id),
      adset_name: text(row.adset_name),
      campaign_id: text(row.campaign_id),
      campaign_name: text(row.campaign_name),
      spend,
      impressions,
      reach,
      link_clicks: linkClicks,
    });
  }

  return out;
}

// DB row -> the shape adTrackerMetrics consumes. numeric(12,2) arrives from
// PostgREST as a string, so everything goes through Number().
export function toSpendRows(rows: Record<string, unknown>[]): TrackerSpendRow[] {
  const n = (v: unknown) => {
    const parsed = Number(v ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const s = (v: unknown) => (typeof v === "string" ? v : "");

  return rows.map((row) => ({
    date: s(row.date),
    adId: s(row.ad_id),
    adName: s(row.ad_name),
    adsetId: s(row.adset_id),
    adsetName: s(row.adset_name),
    campaignId: s(row.campaign_id),
    campaignName: s(row.campaign_name),
    spend: n(row.spend),
    impressions: n(row.impressions),
    reach: n(row.reach),
    linkClicks: n(row.link_clicks),
  }));
}

// Pull a trailing window of per-day, per-ad insights.
//
// time_increment=1 is what makes Meta break the range into days instead of
// returning one aggregate row. The Make scenario used all_days with a
// single-day preset, which happened to give one row per ad but could not
// backfill.
export async function fetchAdDays(
  token: string,
  adAccount: string,
  days = 7,
): Promise<MetaInsightRow[]> {
  const account = adAccount.startsWith("act_") ? adAccount : `act_${adAccount}`;
  const rows = await graphGetAll(token, `/${account}/insights`, {
    level: "ad",
    fields: INSIGHT_FIELDS,
    date_preset: days <= 7 ? "last_7d" : days <= 30 ? "last_30d" : "last_90d",
    time_increment: "1",
    limit: "500",
  });
  return rows as MetaInsightRow[];
}
