import { DEMO_ADS, DEMO_WEEKLY } from "../routes/paid-ads/shared";

// Client-side shape for the Paid Ads tabs, mirroring
// functions/api/ads/insights.ts. In a real session the hook fetches this from
// Meta; in a demo session api() short-circuits to demoAdsInsights() built from
// the existing hand-authored demo ads, so the wired tabs read full in ?demo=1.

export interface AdItem {
  id: string;
  headline: string;
  copy: string;
  platforms: ("fb" | "ig")[];
  active: boolean;
  leads: number;
  reach: number;
  spend: number;
  // Real Meta creative image URL; absent/"" => the card uses a gradient
  // placeholder. Demo ads leave it unset.
  thumbnailUrl?: string;
}

export interface AdsInsightsResponse {
  configured: boolean;
  currency: string;
  totals: {
    spend: number;
    leads: number;
    costPerLead: number;
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
  // Plain campaign phase for the Overview badge (from Meta ad-set learning
  // status). null => unknown, badge hidden.
  phase: "learning" | "scaling" | null;
  error?: string;
}

// Empty (configured, but no spend): the honest zero state a real client sees
// before ads have run. `configured` is set by the caller/handler.
export function emptyAdsInsights(configured: boolean): AdsInsightsResponse {
  return {
    configured,
    currency: "USD",
    totals: {
      spend: 0, leads: 0, costPerLead: 0, customers: 0, revenue: 0, roas: 0,
      impressions: 0, reach: 0, frequency: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0,
    },
    lastMonthLeads: 0,
    weekly: [],
    sources: { fb: 0, ig: 0 },
    ads: [],
    phase: null,
  };
}

// Coerce whatever the endpoint returns into a complete response. The endpoint
// sends a bare { configured: false } when Meta isn't wired; a plain `?? empty`
// fallback doesn't catch that (it's a non-null object), so the tabs used to
// destructure `totals`/`ads` off it and white-screen. This backfills any missing
// field onto the empty shape so no partial/malformed payload can crash a tab.
export function normalizeAdsInsights(raw: unknown): AdsInsightsResponse {
  if (!raw || typeof raw !== "object") return emptyAdsInsights(false);
  const r = raw as Partial<AdsInsightsResponse>;
  const base = emptyAdsInsights(Boolean(r.configured));
  return {
    ...base,
    ...r,
    configured: Boolean(r.configured),
    totals: { ...base.totals, ...(r.totals ?? {}) },
    weekly: Array.isArray(r.weekly) ? r.weekly : base.weekly,
    sources: { ...base.sources, ...(r.sources ?? {}) },
    ads: Array.isArray(r.ads) ? r.ads : base.ads,
    phase: r.phase === "learning" || r.phase === "scaling" ? r.phase : null,
  };
}

// Demo payload derived from the existing hand-authored ads so the wired tabs
// show the same rich preview they always did in ?demo=1.
export function demoAdsInsights(): AdsInsightsResponse {
  const ads: AdItem[] = DEMO_ADS.map((a) => ({
    id: a.id,
    headline: a.headline,
    copy: a.copy,
    platforms: a.platforms.map((p) => (p === "ig" ? "ig" : "fb")),
    active: a.active,
    leads: a.leads,
    reach: a.reach,
    spend: Math.round(a.leads * 58), // ~$58 CPL, matches the demo cockpit
  }));
  const leads = ads.reduce((s, a) => s + a.leads, 0);
  const spend = ads.reduce((s, a) => s + a.spend, 0);
  const igLeads = DEMO_ADS.filter((a) => a.platforms.includes("ig")).reduce((s, a) => s + a.leads, 0);
  return {
    configured: true,
    currency: "USD",
    totals: {
      spend,
      leads,
      costPerLead: leads > 0 ? Math.round(spend / leads) : 0,
      customers: 7,
      revenue: 14200,
      roas: spend > 0 ? Math.round((14200 / spend) * 10) / 10 : 0,
      impressions: 48000,
      reach: ads.reduce((s, a) => s + a.reach, 0),
      frequency: 1.8,
      clicks: 640,
      ctr: 1.3,
      cpc: 2.9,
      cpm: 9.2,
    },
    lastMonthLeads: 27,
    weekly: DEMO_WEEKLY.map((w) => ({ label: w.label, value: w.value })),
    sources: { fb: leads - igLeads, ig: igLeads },
    ads,
    phase: "scaling",
  };
}
