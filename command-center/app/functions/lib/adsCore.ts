import type { Env } from "./env";
import type { GhlContext } from "./ghl";
import { adRevenueThisMonth } from "./adsRevenue";
import { graphGet } from "./metaGraph";
import { actionsValue } from "./metaActions";
import { resolveMetaToken } from "./metaToken";

// The conversion-counting rollup moved to lib/metaActions.ts on 2026-08-13, so
// the nightly meta_ad_days snapshot counts leads exactly the way this file does.
// Re-exported because the existing tests and callers import it from here.
export { actionsValue, ACTION_GROUPS } from "./metaActions";

// Real Meta (Facebook/Instagram) Ads insights shaping, shared by the client
// Paid Ads endpoint (functions/api/ads/insights.ts) and, in a later phase, the
// admin Fulfillment cockpit's per-tenant view. Ports the proven Graph API
// field lists and conversion-action parsing from the desktop app's
// meta_ads.rs. Read-only.
//
// This module is pure with respect to WHO the tenant is: every caller passes
// an explicit AdsContext (Meta account, GHL token/location, timezone) instead
// of reading a session-derived tenant. The client endpoint resolves that
// context from ctx.data.tenant; the admin endpoint resolves it from an
// admin-chosen tenantId. Both call buildAdsInsights so the shaping logic
// never drifts between the two surfaces.
//
// One agency System-User token (env.META_SYSTEM_USER_TOKEN) spans every
// client's ad account; the ACCOUNT is per-tenant (ctx.metaAccount).
//
// "New customers", "Revenue from ads" and "Your return" (ROAS) can't come from
// Meta for a lead-gen business: only GHL knows which ad leads became paid jobs.
// Those three come from a GHL join (functions/lib/adsRevenue.ts) over this
// month's Job Completed opportunities tagged "facebook ads". Everything else is
// Meta. Because the join is several GHL round-trips, the whole payload is cached
// per account+location+month in KV for 15 minutes when a KV_CACHE binding exists.
//
// Golden rule: a real client only ever sees their real numbers. The caller
// (the thin endpoint wrapper) handles the not-connected case before ever
// building an AdsContext; once buildAdsInsights runs, Meta is assumed
// configured, and a Meta call failure degrades to an honest empty payload with
// every figure at zero rather than a fabricated number.

// The context a caller must supply: which Meta account, which GHL
// token/location (for the revenue join), and which IANA zone (for the
// GHL-join month boundary). No session or request object is read here.
export interface AdsContext {
  metaAccount: string;
  ghlToken: string;
  ghlLocationId: string;
  zone: string;
}

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

interface AdItem {
  id: string;
  headline: string;
  copy: string;
  platforms: ("fb" | "ig")[];
  active: boolean;
  leads: number;
  reach: number;
  spend: number;
  // The real creative image (Meta image_url / link picture / video poster), or
  // "" when the ad has none (the client falls back to a gradient placeholder).
  thumbnailUrl: string;
  // "image" or "video". A video ad carries a playable videoId; an image ad
  // leaves it "". The client uses these to badge and play video creatives.
  mediaType: "image" | "video";
  videoId: string;
  // Campaign/ad-set names, added for the admin cockpit's Campaigns tree
  // (functions/api/admin/.../ads/insights). "" when Meta omits the nested
  // object. The client Paid Ads UI ignores these two fields.
  campaignName: string;
  adsetName: string;
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
    frequency: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
  };
  lastMonthLeads: number;
  weekly: { label: string; value: number }[];
  sources: { fb: number; ig: number };
  ads: AdItem[];
  // Plain campaign phase for the client badge, derived from Meta's ad-set
  // learning status. null => unknown (badge hidden), never a fabricated value.
  phase: "learning" | "scaling" | null;
  error?: string;
}

export const EMPTY_TOTALS = {
  spend: 0, leads: 0, costPerLead: 0, customers: 0, revenue: 0, roas: 0,
  impressions: 0, reach: 0, frequency: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0,
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
export function buildAds(
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
    const videoData = (story.video_data ?? {}) as Record<string, unknown>;
    const videoId = String(videoData.video_id ?? "");
    const mediaType: "image" | "video" = videoId ? "video" : "image";
    // Video ads keep their headline/copy under video_data, not link_data, so
    // read both. Without this a video ad shows no copy and a name-only headline.
    const headline =
      String(creative.title ?? "") ||
      String(videoData.title ?? "") ||
      String(videoData.link_description ?? "") ||
      String(linkData.name ?? "") ||
      String(m.name ?? "") ||
      "Ad";
    const copy =
      String(creative.body ?? "") ||
      String(videoData.message ?? "") ||
      String(linkData.message ?? "") ||
      "";
    // Prefer a crisp full creative. A video ad's real poster is
    // video_data.image_url; creative.thumbnail_url is a tiny blurry auto-thumb,
    // so it is the LAST resort. An ad with none leaves this "" (gradient fallback).
    const thumbnailUrl =
      String(creative.image_url ?? "") ||
      String(videoData.image_url ?? "") ||
      String(linkData.picture ?? "") ||
      String(creative.thumbnail_url ?? "");
    const status = String(m.effective_status ?? "");
    const campaign = (m.campaign ?? {}) as Record<string, unknown>;
    const adset = (m.adset ?? {}) as Record<string, unknown>;
    ads.push({
      id,
      headline,
      copy,
      platforms: ["fb", "ig"],
      active: status === "ACTIVE",
      leads: Math.round(actionsValue(ins, "actions")),
      reach: Math.round(num(ins.reach)),
      spend: round2(num(ins.spend)),
      thumbnailUrl,
      mediaType,
      videoId,
      campaignName: String(campaign.name ?? ""),
      adsetName: String(adset.name ?? ""),
    });
  }
  // Show every ad in the account, published or not (Jake's call): drafts and
  // paused ads still belong in "Your Ads". The /ads edge already omits deleted
  // ads, so no extra filtering. Active first, then most leads, so the running
  // ads lead the gallery.
  return ads.sort(
    (a, b) => Number(b.active) - Number(a.active) || b.leads - a.leads,
  );
}

// Roll every active ad set's Meta learning status into one plain client phase.
// LEARNING (Meta still optimizing) => "learning"; SUCCESS / LEARNING_LIMITED
// (learning finished) => "scaling". Best-effort: any failure or an account with
// no readable learning status degrades to null so the badge simply hides.
export function derivePhase(
  adsets: Record<string, unknown>[],
): "learning" | "scaling" | null {
  let anyLearning = false;
  let anyScaling = false;
  for (const row of adsets) {
    if (String(row.effective_status ?? "") !== "ACTIVE") continue;
    const info = (row.learning_stage_info ?? {}) as { status?: string };
    const status = String(info.status ?? "");
    if (status === "LEARNING") anyLearning = true;
    else if (status === "SUCCESS" || status === "LEARNING_LIMITED") anyScaling = true;
  }
  if (anyLearning) return "learning";
  if (anyScaling) return "scaling";
  return null;
}

// The full Paid Ads Overview/Insights/Creatives payload for one tenant. Callers
// (the client endpoint, and later the admin endpoint) must already know Meta is
// configured (token + account resolved) before calling this: it does not
// itself decide the not-connected case, so it always attempts the Meta calls.
export async function buildAdsInsights(
  env: Env,
  ctx: AdsContext,
): Promise<AdsInsightsResponse> {
  // env first, then the agency_meta row (0106): a token pasted into the Paid
  // Ads wizard is live on save, with no deploy.
  const token = (await resolveMetaToken(env)) ?? "";
  const account = ctx.metaAccount;

  // Cache the whole payload per account+location+month. The month key rolls the
  // cache at each month boundary (spend + revenue are both this-month). Skipped
  // gracefully when no KV binding is present.
  const monthKey = new Date().toISOString().slice(0, 7);
  const cacheKey = `ads:insights:v2:${account}:${ctx.ghlLocationId}:${monthKey}`;
  const kv = env.KV_CACHE;
  if (kv) {
    const cached = await kv.get(cacheKey);
    if (cached) return JSON.parse(cached) as AdsInsightsResponse;
  }

  try {
    const totalsResp = await graphGet(token, `/${account}/insights`, {
      level: "account",
      date_preset: "this_month",
      fields: "spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions",
    });
    const trow = (((totalsResp.data as unknown[]) ?? [])[0] ?? {}) as Record<string, unknown>;
    const spend = num(trow.spend);
    const leads = actionsValue(trow, "actions");

    // The GHL join: this month's ad-won customers + revenue. A GHL failure must
    // never sink the Meta numbers, so degrade to honest zeros on any error.
    let customers = 0;
    let revenue = 0;
    if (ctx.ghlToken && ctx.ghlLocationId) {
      try {
        const gctx: GhlContext = { token: ctx.ghlToken, locationId: ctx.ghlLocationId };
        const r = await adRevenueThisMonth(gctx, ctx.zone);
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
      graphGet(token, `/${account}/ads`, { fields: "id,name,effective_status,creative{title,body,object_story_spec,image_url,thumbnail_url},campaign{name},adset{name}", limit: "200" }),
    ]);

    // Campaign phase from ad-set learning status (best-effort; never sinks the call).
    let phase: "learning" | "scaling" | null = null;
    try {
      const adsetResp = await graphGet(token, `/${account}/adsets`, {
        fields: "effective_status,learning_stage_info",
        limit: "200",
      });
      phase = derivePhase((adsetResp.data as Record<string, unknown>[]) ?? []);
    } catch {
      // leave phase null (badge hidden)
    }

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
        frequency: round2(num(trow.frequency)),
        clicks: Math.round(num(trow.clicks)),
        ctr: round2(num(trow.ctr)),
        cpc: round2(num(trow.cpc)),
        cpm: round2(num(trow.cpm)),
      },
      lastMonthLeads: Math.round(lastMonthLeads),
      weekly: bucketWeekly((dailyResp.data as Record<string, unknown>[]) ?? []),
      sources: { fb: Math.round(fb), ig: Math.round(ig) },
      ads: buildAds(
        (adInsResp.data as Record<string, unknown>[]) ?? [],
        (adMetaResp.data as Record<string, unknown>[]) ?? [],
      ),
      phase,
    };
    if (kv) await kv.put(cacheKey, JSON.stringify(payload), { expirationTtl: 900 });
    return payload;
  } catch (e) {
    // Configured but the Meta call failed (token/permission/transient). Degrade
    // to an honest empty payload with the reason, never a fabricated number.
    return {
      configured: true,
      currency: "USD",
      totals: EMPTY_TOTALS,
      lastMonthLeads: 0,
      weekly: [],
      sources: { fb: 0, ig: 0 },
      ads: [],
      phase: null,
      error: (e as Error).message,
    } satisfies AdsInsightsResponse;
  }
}
