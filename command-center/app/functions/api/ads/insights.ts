import { tenantTimezone, type Env, type ApiData } from "../../lib/env";
import type { GhlContext } from "../../lib/ghl";
import { adRevenueThisMonth } from "../../lib/adsRevenue";

// Real Meta (Facebook/Instagram) Ads insights for the client's Paid Ads tabs
// (Overview / Insights / Creatives). Ports the proven Graph API field lists and
// conversion-action parsing from the desktop app's meta_ads.rs. Read-only.
//
// One agency System-User token (META_SYSTEM_USER_TOKEN) spans every client's ad
// account. The ACCOUNT is per-client: it comes from the tenant's
// meta_ad_account_id (set in the admin client editor), with the
// META_AD_ACCOUNT_ID env var as the single-tenant fallback. This is why one
// client can never see another's ad numbers, even though the token is shared.
//
// "New customers", "Revenue from ads" and "Your return" (ROAS) can't come from
// Meta for a lead-gen business: only GHL knows which ad leads became paid jobs.
// Those three come from a GHL join (functions/lib/adsRevenue.ts) over this
// month's Job Completed opportunities tagged "facebook ads". Everything else is
// Meta. Because the join is several GHL round-trips, the whole payload is cached
// per account+location+month in KV for 15 minutes when a KV_CACHE binding exists.
//
// Golden rule: a real client only ever sees their real numbers. When Meta is not
// configured the endpoint returns { configured: false } and the tabs show their
// not-connected state; when configured but the account has no spend (e.g. ads
// not launched yet), every figure is an honest zero.

const GRAPH = "https://graph.facebook.com/v21.0";

// The conversion action types we count as a "lead"/result, matching meta_ads.rs.
// A client on a non-standard action type simply reads zero results (never a
// fabricated number).
const CONVERSION_ACTIONS = new Set([
  "offsite_conversion.fb_pixel_purchase",
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_lead",
  "lead",
  "leadgen.other",
  "onsite_conversion.lead_grouped",
  "complete_registration",
  "offsite_conversion.fb_pixel_complete_registration",
]);

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Sum the values of the conversion action types in an insights row's `actions`
// (count) or `action_values` (revenue) array.
function actionsValue(row: Record<string, unknown>, key: string): number {
  const arr = row[key];
  if (!Array.isArray(arr)) return 0;
  let total = 0;
  for (const entry of arr) {
    const t = (entry as { action_type?: string }).action_type ?? "";
    if (CONVERSION_ACTIONS.has(t)) total += num((entry as { value?: unknown }).value);
  }
  return total;
}

async function graphGet(
  token: string,
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const url = new URL(GRAPH + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

interface AdItem {
  id: string;
  headline: string;
  copy: string;
  platforms: ("fb" | "ig")[];
  active: boolean;
  leads: number;
  reach: number;
  spend: number;
}

export interface AdsInsightsResponse {
  configured: boolean;
  currency: string;
  totals: {
    spend: number;
    leads: number;
    costPerLead: number;
    // From the GHL join, not Meta: this month's ad-won Job Completed opps
    // (customers) and the sum of their opportunity value (revenue); roas =
    // revenue / spend. See functions/lib/adsRevenue.ts + the connections doc.
    customers: number;
    revenue: number;
    roas: number;
    impressions: number;
    reach: number;
    clicks: number;
    ctr: number;
    cpc: number;
  };
  lastMonthLeads: number;
  weekly: { label: string; value: number }[];
  sources: { fb: number; ig: number };
  ads: AdItem[];
  error?: string;
}

const EMPTY_TOTALS = {
  spend: 0, leads: 0, costPerLead: 0, customers: 0, revenue: 0, roas: 0,
  impressions: 0, reach: 0, clicks: 0, ctr: 0, cpc: 0,
};

// Bucket daily insights rows into up-to-5 "Week N" leads totals for the month.
function bucketWeekly(daily: Record<string, unknown>[]): { label: string; value: number }[] {
  const weeks = new Map<number, number>();
  for (const row of daily) {
    const date = String(row.date_start ?? "");
    const day = parseInt(date.slice(8, 10), 10);
    if (!Number.isFinite(day)) continue;
    const wk = Math.floor((day - 1) / 7); // 0..4
    weeks.set(wk, (weeks.get(wk) ?? 0) + actionsValue(row, "actions"));
  }
  const maxWk = weeks.size ? Math.max(...weeks.keys()) : -1;
  const out: { label: string; value: number }[] = [];
  for (let i = 0; i <= maxWk; i++) {
    out.push({ label: `Week ${i + 1}`, value: Math.round(weeks.get(i) ?? 0) });
  }
  return out;
}

// Join ad-level insights (leads/spend/reach by ad) to ad metadata (name, status,
// creative copy) into the shape the Creatives + Overview "running now" want.
function buildAds(
  insights: Record<string, unknown>[],
  meta: Record<string, unknown>[],
): AdItem[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of insights) {
    const id = String(row.ad_id ?? "");
    if (id) byId.set(id, row);
  }
  const ads: AdItem[] = [];
  for (const m of meta) {
    const id = String(m.id ?? "");
    if (!id) continue;
    const ins = byId.get(id) ?? {};
    const creative = (m.creative ?? {}) as Record<string, unknown>;
    const story = (creative.object_story_spec ?? {}) as Record<string, unknown>;
    const linkData = (story.link_data ?? {}) as Record<string, unknown>;
    const headline =
      String(creative.title ?? "") ||
      String(linkData.name ?? "") ||
      String(m.name ?? "") ||
      "Ad";
    const copy =
      String(creative.body ?? "") || String(linkData.message ?? "") || "";
    ads.push({
      id,
      headline,
      copy,
      platforms: ["fb", "ig"],
      active: String(m.effective_status ?? "") === "ACTIVE",
      leads: Math.round(actionsValue(ins, "actions")),
      reach: Math.round(num(ins.reach)),
      spend: round2(num(ins.spend)),
    });
  }
  // Only surface ads that actually ran (have spend or leads) plus any active ad,
  // newest-relevant first by leads.
  return ads
    .filter((a) => a.active || a.spend > 0 || a.leads > 0)
    .sort((a, b) => b.leads - a.leads);
}

// The ad account for this request: the client's own (from their tenant row)
// wins; the global env var is only the single-tenant fallback. Exported for the
// precedence test, which is the whole point of scoping ads per client.
export function resolveAdAccount(
  tenantAccount: string | undefined,
  envAccount: string | undefined,
): string | undefined {
  const t = tenantAccount?.trim();
  if (t) return t;
  const e = envAccount?.trim();
  return e || undefined;
}

export const onRequestGet: PagesFunction<Env, string, ApiData> = async (ctx) => {
  const token = ctx.env.META_SYSTEM_USER_TOKEN;
  let account = resolveAdAccount(ctx.data.tenant?.meta_ad_account_id, ctx.env.META_AD_ACCOUNT_ID);
  if (!token || !account) {
    // Full empty shape (not a bare { configured: false }) so the client always
    // receives a complete payload and no Paid Ads tab can crash on a missing
    // field before Meta is wired.
    return Response.json({
      configured: false,
      currency: "USD",
      totals: EMPTY_TOTALS,
      lastMonthLeads: 0,
      weekly: [],
      sources: { fb: 0, ig: 0 },
      ads: [],
    } satisfies AdsInsightsResponse);
  }
  if (!account.startsWith("act_")) account = `act_${account}`;

  const zone = tenantTimezone(ctx.env);
  // Cache the whole payload per account+location+month. The month key rolls the
  // cache at each month boundary (spend + revenue are both this-month). Skipped
  // gracefully when no KV binding is present.
  const monthKey = new Date().toISOString().slice(0, 7);
  const cacheKey = `ads:insights:v2:${account}:${ctx.data.tenant?.ghl_location_id ?? "-"}:${monthKey}`;
  const kv = ctx.env.KV_CACHE;
  if (kv) {
    const cached = await kv.get(cacheKey);
    if (cached) return new Response(cached, { headers: { "content-type": "application/json" } });
  }

  try {
    const totalsResp = await graphGet(token, `/${account}/insights`, {
      level: "account",
      date_preset: "this_month",
      fields: "spend,impressions,clicks,ctr,cpc,reach,actions",
    });
    const trow = (((totalsResp.data as unknown[]) ?? [])[0] ?? {}) as Record<string, unknown>;
    const spend = num(trow.spend);
    const leads = actionsValue(trow, "actions");

    // The GHL join: this month's ad-won customers + revenue. A GHL failure must
    // never sink the Meta numbers, so degrade to honest zeros on any error.
    let customers = 0;
    let revenue = 0;
    const t = ctx.data.tenant;
    if (t?.ghl_token && t?.ghl_location_id) {
      try {
        const gctx: GhlContext = { token: t.ghl_token, locationId: t.ghl_location_id };
        const r = await adRevenueThisMonth(gctx, zone);
        customers = r.customers;
        revenue = r.revenue;
      } catch {
        // leave customers/revenue at 0
      }
    }

    const [lastResp, dailyResp, adInsResp, adMetaResp] = await Promise.all([
      graphGet(token, `/${account}/insights`, { level: "account", date_preset: "last_month", fields: "actions" }),
      graphGet(token, `/${account}/insights`, { level: "account", date_preset: "this_month", time_increment: "1", fields: "actions,date_start" }),
      graphGet(token, `/${account}/insights`, { level: "ad", date_preset: "this_month", fields: "ad_id,ad_name,spend,reach,actions", limit: "200" }),
      graphGet(token, `/${account}/ads`, { fields: "id,name,effective_status,creative{title,body,object_story_spec}", limit: "200" }),
    ]);

    // Platform split (best-effort; a failure here must not sink the whole call).
    let fb = 0;
    let ig = 0;
    try {
      const platResp = await graphGet(token, `/${account}/insights`, {
        level: "account",
        date_preset: "this_month",
        breakdowns: "publisher_platform",
        fields: "actions",
      });
      for (const row of ((platResp.data as Record<string, unknown>[]) ?? [])) {
        const v = actionsValue(row, "actions");
        if (row.publisher_platform === "instagram") ig += v;
        else if (row.publisher_platform === "facebook") fb += v;
      }
    } catch {
      // leave fb/ig at 0
    }

    const lastMonthLeads = actionsValue(
      (((lastResp.data as unknown[]) ?? [])[0] ?? {}) as Record<string, unknown>,
      "actions",
    );

    const payload: AdsInsightsResponse = {
      configured: true,
      currency: "USD",
      totals: {
        spend: round2(spend),
        leads: Math.round(leads),
        costPerLead: leads > 0 ? round2(spend / leads) : 0,
        // From the GHL join (this month's ad-won Job Completed opps), not Meta.
        customers,
        revenue: round2(revenue),
        roas: spend > 0 ? round2(revenue / spend) : 0,
        impressions: Math.round(num(trow.impressions)),
        reach: Math.round(num(trow.reach)),
        clicks: Math.round(num(trow.clicks)),
        ctr: round2(num(trow.ctr)),
        cpc: round2(num(trow.cpc)),
      },
      lastMonthLeads: Math.round(lastMonthLeads),
      weekly: bucketWeekly((dailyResp.data as Record<string, unknown>[]) ?? []),
      sources: { fb: Math.round(fb), ig: Math.round(ig) },
      ads: buildAds(
        (adInsResp.data as Record<string, unknown>[]) ?? [],
        (adMetaResp.data as Record<string, unknown>[]) ?? [],
      ),
    };
    const body = JSON.stringify(payload);
    if (kv) await kv.put(cacheKey, body, { expirationTtl: 900 });
    return new Response(body, { headers: { "content-type": "application/json" } });
  } catch (e) {
    // Configured but the Meta call failed (token/permission/transient). Degrade
    // to an honest empty payload with the reason, never a fabricated number.
    return Response.json({
      configured: true,
      currency: "USD",
      totals: EMPTY_TOTALS,
      lastMonthLeads: 0,
      weekly: [],
      sources: { fb: 0, ig: 0 },
      ads: [],
      error: (e as Error).message,
    } satisfies AdsInsightsResponse);
  }
};
