/**
 * Mock Meta Ads data — placeholder until the official Meta Ads MCP is wired up.
 *
 * Shape kept close to Meta Marketing API field names so the eventual swap to a
 * real MCP `ads_insights_*` call is mostly a loader change, not a UI change.
 * When the MCP lands, replace `getMockAdsAccount` with a real fetch + cache
 * layer and the AdsManagerPage component should keep working.
 *
 * Numbers are deterministic per client slug so the UI doesn't reshuffle on
 * every render and demos look stable.
 */

export type AdStatus = "active" | "paused" | "learning" | "off";

export interface AdCreative {
  id: string;
  name: string;
  /** "image" | "video" | "carousel" */
  format: "image" | "video" | "carousel";
  thumbColor: string;
  headline: string;
  primaryText: string;
}

export interface MetaAd {
  id: string;
  name: string;
  status: AdStatus;
  creative: AdCreative;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  results: number;
  cpr: number;
  roas: number;
  frequency: number;
}

export interface MetaAdSet {
  id: string;
  name: string;
  status: AdStatus;
  audience: string;
  budgetDaily: number;
  ads: MetaAd[];
  spend: number;
  results: number;
  cpr: number;
  roas: number;
  frequency: number;
}

export interface MetaCampaign {
  id: string;
  name: string;
  objective: string;
  status: AdStatus;
  budgetDaily: number;
  adSets: MetaAdSet[];
  spend: number;
  results: number;
  cpr: number;
  roas: number;
  ctr: number;
  cpm: number;
  frequency: number;
}

export interface DailySpendPoint {
  date: string;
  spend: number;
  results: number;
  revenue: number;
}

export interface MetaAdsAccount {
  accountId: string;
  accountName: string;
  currency: string;
  clientSlug: string;
  clientName: string;
  /** "connected" when a real ad account is wired; "mock" otherwise. */
  source: "mock" | "connected";
  /** Rolled-up KPIs for the visible time window. */
  totals: {
    spend: number;
    results: number;
    cpr: number;
    roas: number;
    revenue: number;
    ctr: number;
    cpm: number;
    frequency: number;
  };
  daily: DailySpendPoint[];
  campaigns: MetaCampaign[];
}

const PALETTE = ["#b478ff", "#5fe699", "#38bdf8", "#a78bfa", "#f59e0b", "#b478ff", "#22d3ee"];

function hashSlug(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function seededRandom(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function makeAd(
  campaignSlug: string,
  adSetIdx: number,
  adIdx: number,
  rng: () => number,
  baseCpa: number,
  baseRoas: number,
): MetaAd {
  const id = `${campaignSlug}-as${adSetIdx}-ad${adIdx}`;
  const variation = 0.7 + rng() * 0.7;
  const spend = round2(60 + rng() * 380);
  const cpa = round2(baseCpa * variation);
  const results = Math.max(1, Math.round(spend / cpa));
  const impressions = Math.round(spend / (round2(12 + rng() * 18) / 1000));
  const clicks = Math.round(impressions * (0.008 + rng() * 0.025));
  const ctr = round2((clicks / impressions) * 100);
  const cpm = round2((spend / impressions) * 1000);
  const cpc = round2(spend / Math.max(1, clicks));
  const roas = round2(baseRoas * variation);
  const frequency = round2(1.1 + rng() * 1.8);

  const formats: AdCreative["format"][] = ["image", "video", "carousel"];
  const headlines = [
    "Free quote in under 60 seconds",
    "Done in a day, no mess, no upsell",
    "See why 200+ neighbors trust us",
    "Same-week service, every time",
    "Local crew. Real reviews. Real fast.",
    "Spring special: limited slots",
    "We do this. You don't have to.",
  ];
  const primaries = [
    "Most people don't realize they're paying double. Here's what we actually charge.",
    "If your last quote felt high, you're right. Watch this 30-second walkthrough.",
    "Before / after from this week. The difference is in the prep, not the price.",
    "Three things we do that nobody else in town will. That's why our calendar fills.",
  ];

  return {
    id,
    name: `Ad ${adIdx + 1}: ${headlines[(hashSlug(id) + adIdx) % headlines.length].slice(0, 28)}`,
    status: rng() > 0.85 ? "paused" : rng() > 0.75 ? "learning" : "active",
    creative: {
      id: `cr-${id}`,
      name: `Creative ${adIdx + 1}`,
      format: formats[(adIdx + adSetIdx) % formats.length],
      thumbColor: PALETTE[(hashSlug(id) + adIdx) % PALETTE.length],
      headline: headlines[(hashSlug(id) + adIdx) % headlines.length],
      primaryText: primaries[(hashSlug(id) + adSetIdx) % primaries.length],
    },
    spend,
    impressions,
    clicks,
    ctr,
    cpm,
    cpc,
    results,
    cpr: cpa,
    roas,
    frequency,
  };
}

function makeAdSet(
  campaignSlug: string,
  idx: number,
  rng: () => number,
  baseCpa: number,
  baseRoas: number,
): MetaAdSet {
  const audiences = [
    "Homeowners 35-65 · 25mi radius",
    "Lookalike 1%: Past customers",
    "Retargeting: Site visitors 30d",
    "Interest stack: Home services",
    "Broad: Local geo",
    "Engagement audience 180d",
  ];
  const id = `${campaignSlug}-as${idx}`;
  const adCount = 2 + Math.floor(rng() * 3);
  const ads: MetaAd[] = [];
  for (let i = 0; i < adCount; i++) {
    ads.push(makeAd(campaignSlug, idx, i, rng, baseCpa, baseRoas));
  }
  const spend = round2(ads.reduce((s, a) => s + a.spend, 0));
  const results = ads.reduce((s, a) => s + a.results, 0);
  const cpr = round2(spend / Math.max(1, results));
  const roas = round2(ads.reduce((s, a) => s + a.roas, 0) / ads.length);
  const frequency = round2(ads.reduce((s, a) => s + a.frequency, 0) / ads.length);

  return {
    id,
    name: audiences[(hashSlug(id) + idx) % audiences.length],
    status: rng() > 0.85 ? "paused" : "active",
    audience: audiences[(hashSlug(id) + idx) % audiences.length],
    budgetDaily: Math.round(40 + rng() * 110),
    ads,
    spend,
    results,
    cpr,
    roas,
    frequency,
  };
}

function makeCampaign(
  slug: string,
  idx: number,
  rng: () => number,
  baseCpa: number,
  baseRoas: number,
): MetaCampaign {
  const objectives = ["LEADS", "PURCHASES", "TRAFFIC", "AWARENESS", "ENGAGEMENT"];
  const names = [
    "Win-Replacement-Q2",
    "Brand Awareness",
    "Retargeting: 30d",
    "Spring Promo",
    "Lookalike Push",
    "Local Coverage",
  ];
  const id = `${slug}-cmp${idx}`;
  const adSetCount = 1 + Math.floor(rng() * 3);
  const adSets: MetaAdSet[] = [];
  for (let i = 0; i < adSetCount; i++) {
    adSets.push(makeAdSet(id, i, rng, baseCpa, baseRoas));
  }
  const spend = round2(adSets.reduce((s, a) => s + a.spend, 0));
  const results = adSets.reduce((s, a) => s + a.results, 0);
  const cpr = round2(spend / Math.max(1, results));
  const roas = round2(adSets.reduce((s, a) => s + a.roas, 0) / adSets.length);

  let totalImps = 0;
  let totalClicks = 0;
  let totalFreq = 0;
  let adCount = 0;
  for (const aset of adSets) {
    for (const ad of aset.ads) {
      totalImps += ad.impressions;
      totalClicks += ad.clicks;
      totalFreq += ad.frequency;
      adCount++;
    }
  }

  return {
    id,
    name: names[(hashSlug(id) + idx) % names.length],
    objective: objectives[(hashSlug(id) + idx) % objectives.length],
    status: idx === 0 ? "active" : rng() > 0.7 ? "paused" : "active",
    budgetDaily: Math.round(60 + rng() * 200),
    adSets,
    spend,
    results,
    cpr,
    roas,
    ctr: round2((totalClicks / Math.max(1, totalImps)) * 100),
    cpm: round2((spend / Math.max(1, totalImps)) * 1000),
    frequency: round2(totalFreq / Math.max(1, adCount)),
  };
}

function makeDailySeries(
  rng: () => number,
  totalSpend: number,
  totalResults: number,
  totalRevenue: number,
  days: number,
): DailySpendPoint[] {
  const points: DailySpendPoint[] = [];
  const now = new Date();
  const weights: number[] = [];
  for (let i = 0; i < days; i++) weights.push(0.6 + rng() * 0.9);
  const sumW = weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    const share = weights[i] / sumW;
    points.push({
      date: d.toISOString().slice(0, 10),
      spend: round2(totalSpend * share),
      results: Math.round(totalResults * share),
      revenue: round2(totalRevenue * share),
    });
  }
  return points;
}

/**
 * Per-client mock overrides. Add entries here as clients get real-ish demo
 * data; everyone else gets deterministic synthetic data driven off their slug.
 */
const PER_CLIENT_OVERRIDES: Record<string, Partial<MetaAdsAccount> & { baseCpa?: number; baseRoas?: number }> = {
  "willis-windows": {
    accountName: "Willis Windows: Meta Ads",
    accountId: "act_1234567890",
    baseCpa: 38,
    baseRoas: 4.2,
  },
};

export function getMockAdsAccount(
  clientSlug: string,
  clientName: string,
  windowDays = 7,
): MetaAdsAccount {
  const seed = hashSlug(clientSlug);
  const rng = seededRandom(seed);

  const override = PER_CLIENT_OVERRIDES[clientSlug] ?? {};
  const baseCpa = override.baseCpa ?? round2(28 + rng() * 55);
  const baseRoas = override.baseRoas ?? round2(2.4 + rng() * 3.6);

  const campaignCount = 2 + Math.floor(rng() * 2);
  const campaigns: MetaCampaign[] = [];
  for (let i = 0; i < campaignCount; i++) {
    campaigns.push(makeCampaign(clientSlug, i, rng, baseCpa, baseRoas));
  }

  const spend = round2(campaigns.reduce((s, c) => s + c.spend, 0));
  const results = campaigns.reduce((s, c) => s + c.results, 0);
  const cpr = round2(spend / Math.max(1, results));
  const roas = round2(campaigns.reduce((s, c) => s + c.roas, 0) / campaigns.length);
  const revenue = round2(spend * roas);

  let totalImps = 0;
  let totalClicks = 0;
  let totalFreq = 0;
  let adCount = 0;
  for (const c of campaigns) {
    for (const aset of c.adSets) {
      for (const ad of aset.ads) {
        totalImps += ad.impressions;
        totalClicks += ad.clicks;
        totalFreq += ad.frequency;
        adCount++;
      }
    }
  }

  return {
    accountId: override.accountId ?? `act_${seed.toString().slice(-10)}`,
    accountName: override.accountName ?? `${clientName}: Meta Ads`,
    currency: "USD",
    clientSlug,
    clientName,
    source: "mock",
    totals: {
      spend,
      results,
      cpr,
      roas,
      revenue,
      ctr: round2((totalClicks / Math.max(1, totalImps)) * 100),
      cpm: round2((spend / Math.max(1, totalImps)) * 1000),
      frequency: round2(totalFreq / Math.max(1, adCount)),
    },
    daily: makeDailySeries(rng, spend, results, revenue, windowDays),
    campaigns,
  };
}

/** Build accounts for every client. Used by the global Ads Manager view. */
export function getMockAdsAccountsForClients(
  clients: { slug: string; name: string }[],
  windowDays = 7,
): MetaAdsAccount[] {
  return clients.map((c) => getMockAdsAccount(c.slug, c.name, windowDays));
}

/** Status pill colour mapping. */
export function adStatusPill(status: AdStatus): { label: string; className: string } {
  switch (status) {
    case "active":
      return { label: "Active", className: "hml-green" };
    case "paused":
      return { label: "Paused", className: "hml-neutral" };
    case "learning":
      return { label: "Learning", className: "hml-amber" };
    case "off":
      return { label: "Off", className: "hml-neutral" };
  }
}
