// ===========================================================================
// Paid-ads dataset — DEMO DATA.
//
// There is no ad-platform integration wired into the backend yet. This module
// is the single seam where that data will eventually come from: today it
// synthesises a deterministic, internally-consistent dataset (derived rates
// always agree with their base figures) so the Paid Ads surface can be built
// and reviewed against realistic numbers. When a real source lands (Meta
// Marketing API, GHL ad reporting, or a manual entry store), replace
// `buildAdsDataset` with a fetch and keep the exported shapes intact — the UI
// reads only these types.
//
// `DEMO` is true so the UI can label the figures honestly as sample data.
// ===========================================================================

export const DEMO = true;

export type AdsRange = "7d" | "30d" | "90d";

export const RANGE_DAYS: Record<AdsRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export const RANGE_LABEL: Record<AdsRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

// The base metrics a platform actually reports. Everything else is derived from
// these so the numbers can never contradict each other.
export interface AdMetrics {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  conversations: number;
  appointments: number;
  customers: number;
  revenue: number;
}

export type CampaignStatus = "active" | "learning" | "paused";

export interface Campaign {
  id: string;
  name: string;
  objective: string;
  audience: string;
  status: CampaignStatus;
  metrics: AdMetrics;
}

export interface DailyPoint {
  date: string; // ISO yyyy-mm-dd
  spend: number;
  leads: number;
}

export interface AdsDataset {
  range: AdsRange;
  rangeDays: number;
  account: { name: string; platform: string };
  totals: AdMetrics;
  // The previous comparable window, for period-over-period deltas.
  previous: AdMetrics;
  campaigns: Campaign[];
  daily: DailyPoint[];
  demo: boolean;
}

// --- Derived metrics --------------------------------------------------------
// All guard divide-by-zero by returning null so the formatters render "—".

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export const ctr = (m: AdMetrics) => ratio(m.clicks, m.impressions);
export const cpc = (m: AdMetrics) => ratio(m.spend, m.clicks);
export const cpm = (m: AdMetrics) => ratio(m.spend * 1000, m.impressions);
export const cpl = (m: AdMetrics) => ratio(m.spend, m.leads);
export const costPerCustomer = (m: AdMetrics) => ratio(m.spend, m.customers);
export const roas = (m: AdMetrics) => ratio(m.revenue, m.spend);
export const closeRate = (m: AdMetrics) => ratio(m.customers, m.leads);
export const frequency = (m: AdMetrics) => ratio(m.impressions, m.reach);

// Signed percentage change between two figures (0.12 = +12%). Null when the
// prior value is zero (no meaningful baseline).
export function delta(current: number, prior: number): number | null {
  if (!Number.isFinite(prior) || prior === 0) return null;
  return (current - prior) / prior;
}

// --- Deterministic generator ------------------------------------------------
// A small seeded PRNG keeps the figures stable across renders and range
// switches (no flicker, no fabricated movement between two views of the same
// window). Seeded from a constant, never the clock.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Per-campaign profile. Base figures are per-day so any window scales cleanly.
interface CampaignProfile {
  id: string;
  name: string;
  objective: string;
  audience: string;
  status: CampaignStatus;
  dailySpend: number; // USD/day
  cpm: number; // cost per 1k impressions
  ctr: number; // click-through rate
  clickToLead: number; // share of clicks that become leads
  leadToCustomer: number; // share of leads that close
  avgDeal: number; // revenue per customer
  frequency: number; // impressions / reach
}

const PROFILES: CampaignProfile[] = [
  {
    id: "cmp_conv_spring",
    name: "Spring Promo — Conversions",
    objective: "Conversions",
    audience: "Broad · 25–55 · 25mi",
    status: "active",
    dailySpend: 165,
    cpm: 18.5,
    ctr: 0.021,
    clickToLead: 0.115,
    leadToCustomer: 0.18,
    avgDeal: 2400,
    frequency: 1.9,
  },
  {
    id: "cmp_leadgen_broad",
    name: "Lead Gen — Broad",
    objective: "Lead generation",
    audience: "Broad · Advantage+",
    status: "active",
    dailySpend: 140,
    cpm: 14.2,
    ctr: 0.018,
    clickToLead: 0.14,
    leadToCustomer: 0.135,
    avgDeal: 2100,
    frequency: 1.6,
  },
  {
    id: "cmp_retarget_warm",
    name: "Retargeting — Warm 30d",
    objective: "Conversions",
    audience: "Site + engagers 30d",
    status: "active",
    dailySpend: 60,
    cpm: 11.0,
    ctr: 0.034,
    clickToLead: 0.21,
    leadToCustomer: 0.26,
    avgDeal: 2650,
    frequency: 2.7,
  },
  {
    id: "cmp_lal_1pct",
    name: "Lookalike 1% — Buyers",
    objective: "Lead generation",
    audience: "LAL 1% · purchasers",
    status: "learning",
    dailySpend: 95,
    cpm: 16.0,
    ctr: 0.019,
    clickToLead: 0.12,
    leadToCustomer: 0.16,
    avgDeal: 2300,
    frequency: 1.4,
  },
  {
    id: "cmp_awareness",
    name: "Brand Awareness — Reach",
    objective: "Awareness",
    audience: "Local · 20mi",
    status: "paused",
    dailySpend: 35,
    cpm: 7.5,
    ctr: 0.009,
    clickToLead: 0.05,
    leadToCustomer: 0.08,
    avgDeal: 1900,
    frequency: 2.1,
  },
];

// Round to whole units; metrics are reported as integers by every platform
// except money, which we keep to whole dollars for the cockpit.
const r0 = (n: number) => Math.max(0, Math.round(n));

function metricsFor(profile: CampaignProfile, days: number, seed: number, scale: number): AdMetrics {
  const rng = mulberry32(seed);
  // ±12% jitter per figure so campaigns don't look templated, then `scale`
  // nudges the whole previous window down a touch for believable growth.
  const j = () => (0.88 + rng() * 0.24) * scale;

  const spend = profile.dailySpend * days * j();
  const impressions = (spend / profile.cpm) * 1000 * j();
  const reach = impressions / profile.frequency;
  const clicks = impressions * profile.ctr * j();
  const leads = clicks * profile.clickToLead * j();
  const customers = leads * profile.leadToCustomer * j();
  const revenue = customers * profile.avgDeal;

  return {
    spend: r0(spend),
    impressions: r0(impressions),
    reach: r0(reach),
    clicks: r0(clicks),
    leads: r0(leads),
    conversations: r0(leads * 0.82),
    appointments: r0(leads * 0.46),
    customers: r0(customers),
    revenue: r0(revenue),
  };
}

function sumMetrics(list: AdMetrics[]): AdMetrics {
  return list.reduce<AdMetrics>(
    (acc, m) => ({
      spend: acc.spend + m.spend,
      impressions: acc.impressions + m.impressions,
      reach: acc.reach + m.reach,
      clicks: acc.clicks + m.clicks,
      leads: acc.leads + m.leads,
      conversations: acc.conversations + m.conversations,
      appointments: acc.appointments + m.appointments,
      customers: acc.customers + m.customers,
      revenue: acc.revenue + m.revenue,
    }),
    {
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      leads: 0,
      conversations: 0,
      appointments: 0,
      customers: 0,
      revenue: 0,
    },
  );
}

// Build a daily spend/leads series ending today, derived from the active
// campaign totals so the trend's area matches the headline figures. `anchor`
// is the reference "today" (passed in; the module never reads the clock).
function dailySeries(totals: AdMetrics, days: number, anchor: Date, seed: number): DailyPoint[] {
  const rng = mulberry32(seed);
  const weights: number[] = [];
  let sum = 0;
  for (let i = 0; i < days; i++) {
    // Gentle upward drift + weekday-ish wobble so the line reads like delivery.
    const drift = 0.8 + (i / Math.max(1, days - 1)) * 0.4;
    const w = drift * (0.8 + rng() * 0.4);
    weights.push(w);
    sum += w;
  }
  const points: DailyPoint[] = [];
  for (let i = 0; i < days; i++) {
    const share = weights[i] / sum;
    const d = new Date(anchor);
    d.setDate(d.getDate() - (days - 1 - i));
    points.push({
      date: d.toISOString().slice(0, 10),
      spend: r0(totals.spend * share),
      leads: r0(totals.leads * share),
    });
  }
  return points;
}

export function buildAdsDataset(range: AdsRange, accountName: string, anchor: Date): AdsDataset {
  const days = RANGE_DAYS[range];

  const campaigns: Campaign[] = PROFILES.map((p) => ({
    id: p.id,
    name: p.name,
    objective: p.objective,
    audience: p.audience,
    status: p.status,
    metrics: metricsFor(p, days, seedFrom(`${p.id}:${range}`), 1),
  }));

  // Paused campaigns spent in the window but aren't delivering now; keep their
  // historical numbers (a media buyer still wants the spend on the books).
  const totals = sumMetrics(campaigns.map((c) => c.metrics));

  // Previous comparable window: same profiles, slightly lower baseline.
  const previous = sumMetrics(
    PROFILES.map((p) => metricsFor(p, days, seedFrom(`${p.id}:${range}:prev`), 0.92)),
  );

  const daily = dailySeries(totals, days, anchor, seedFrom(`daily:${range}`));

  return {
    range,
    rangeDays: days,
    account: { name: accountName, platform: "Meta" },
    totals,
    previous,
    campaigns,
    daily,
    demo: DEMO,
  };
}
