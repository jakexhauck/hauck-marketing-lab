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

import { graphGetAll, graphGet } from "./metaGraph";
import { actionsValue, UNIFIED_ATTRIBUTION } from "./metaActions";
import { dateStringInZone } from "./tz";
import type { TrackerSpendRow } from "./adTrackerMetrics";

// The 11 fields we ask Meta for. Same set the Make scenario used, minus cpm,
// plus `actions`.
//
// adset_id is the reason this table is worth having: GHL has no ad set id, so
// this snapshot is what resolves ad -> ad set -> campaign.
//
// `actions` was added 2026-08-13 and is the whole point of the rebuild. Without
// it the snapshot carried spend and no conversions, so the dashboard's Leads
// figure had to be invented from the CRM, and Willis read 6 against Meta's 51.
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
  "actions",
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
  "leads",
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
  // Meta's conversion array. Counted through metaActions.actionsValue so the
  // roll-up is never summed with its own components.
  actions?: { action_type?: string; value?: string }[];
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
  leads: number;
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
      // Not `metric()`: the conversion count is not a bare field but a whole
      // array that has to be deduplicated first, and an ad with no conversions
      // legitimately has no `actions` key at all.
      leads: Math.round(actionsValue(row as unknown as Record<string, unknown>, "actions")),
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
    leads: n(row.leads),
  }));
}

// The ad account's reporting timezone, e.g. "EST" for Willis or
// "America/Detroit" for Made Better.
//
// Meta buckets every day in this zone. Cutting a date range in UTC instead put
// every impression after 7pm Central on the wrong side of the boundary, which
// is why the dashboard's window and Ads Manager's window never covered the same
// hours. Best-effort: a failure returns null and the caller keeps whatever zone
// it already had rather than failing a sync over a timezone lookup.
export async function fetchAccountTimezone(
  token: string,
  adAccount: string,
): Promise<string | null> {
  const account = adAccount.startsWith("act_") ? adAccount : `act_${adAccount}`;
  try {
    const resp = await graphGet(token, `/${account}`, { fields: "timezone_name" });
    const zone = typeof resp.timezone_name === "string" ? resp.timezone_name.trim() : "";
    return zone || null;
  } catch {
    return null;
  }
}

// Pull a trailing window of per-day, per-ad insights, ENDING TODAY.
//
// time_increment=1 is what makes Meta break the range into days instead of
// returning one aggregate row. The Make scenario used all_days with a
// single-day preset, which happened to give one row per ad but could not
// backfill.
//
// An explicit time_range, not a date_preset, and that distinction is the whole
// comment. Every `last_Nd` preset ENDS YESTERDAY (measured, 2026-08-13:
// last_7d returned 2026-08-06..2026-08-12 against a live account on the 13th).
// So a sync built on the preset never fetched today's row at all, and the two
// ranges that include today were permanently short:
//
//   this_month   ours $253.77   Meta $262.36
//
// Leads matched on that same check, purely because nobody had converted yet
// that morning. By the afternoon it would have been wrong in both columns.
//
// `since` and `until` are calendar dates in the AD ACCOUNT's zone, because that
// is the zone Meta buckets days in.
export async function fetchAdDays(
  token: string,
  adAccount: string,
  days = 7,
  zone = "UTC",
): Promise<MetaInsightRow[]> {
  const account = adAccount.startsWith("act_") ? adAccount : `act_${adAccount}`;
  const until = dateStringInZone(zone, Date.now());
  const [y, m, d] = until.split("-").map(Number);
  const since = new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);

  const rows = await graphGetAll(token, `/${account}/insights`, {
    level: "ad",
    fields: INSIGHT_FIELDS,
    time_range: JSON.stringify({ since, until }),
    time_increment: "1",
    // The account's own attribution setting rather than the API default of
    // 7-day click / 1-day view. No effect on Willis (measured), correct for an
    // account set to anything else.
    ...UNIFIED_ATTRIBUTION,
    limit: "500",
  });
  return rows as MetaInsightRow[];
}
