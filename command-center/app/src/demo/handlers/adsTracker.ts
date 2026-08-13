import { DEMO_LEADS as PAID_ADS_DEMO, PLATFORM_META } from "../../lib/paidAdsPipeline";
import type { AdLead } from "../../lib/paidAdsPipeline";
import type {
  AdTrackerBreakdownRow,
  AdTrackerLevel,
  AdTrackerRange,
  CreativesFolderResponse,
  LeadTrackerLead,
  LeadTrackerResponse,
  LeadTrackerStatus,
  MetaDataResponse,
  MetaDataRow,
} from "../../lib/api";
import type { AdsMediaResponse } from "../../hooks/useAdsMedia";

// Demo fixtures for the four Paid Ads endpoints the demo router had no answer
// for: /api/ads/tracker, /meta-data, /creatives-folder and /media. Without
// these, Lead Tracker (the page the client app OPENS ON), Meta Data and
// Creatives all rendered "Could not load this data" in the demo view, which
// made the demo useless for reviewing exactly those screens.
//
// Everything derives from PAID_ADS_DEMO, the same lead list the Paid Ads
// pipeline board renders, so the tracker cannot tell a different story from the
// board one tab away: same people, same ads, same platforms.

const CPL = 58; // ~$58 cost per lead, matching demoAdsInsights()
const CURRENCY = "USD";

// The demo leads carry a relative age ("8m", "3h", "2d"), not a timestamp. A
// FIXED anchor rather than the clock keeps every derived date stable within a
// session, so the Meta Data table does not reshuffle between renders and the
// range filter always partitions the list the same way.
const ANCHOR = new Date("2026-08-05T15:00:00Z");

// "8m" | "3h" | "2d" -> milliseconds. Anything unparseable reads as "now",
// which lands the lead in every range rather than silently dropping it.
function ageMs(time: string): number {
  const m = /^(\d+)\s*([mhd])$/.exec(time.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  const unit = m[2];
  if (unit === "m") return n * 60_000;
  if (unit === "h") return n * 3600_000;
  return n * 86400_000;
}

function createdAtOf(lead: AdLead): string {
  return new Date(ANCHOR.getTime() - ageMs(lead.time)).toISOString();
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Demo-only approximation of each preset's length. The real boundaries live in
// functions/lib/adTrackerMetrics.ts rangeWindow(); this only has to make the
// sample data look sensible, so it does not reproduce Meta's ends-yesterday rule.
function rangeDays(range: AdTrackerRange): number {
  if (range === "today") return 1;
  if (range === "yesterday") return 2;
  if (range === "last_7d") return 7;
  if (range === "last_14d") return 14;
  if (range === "last_30d") return 30;
  if (range === "this_month") return 30;
  if (range === "last_month") return 60;
  return 3650;
}

// Deterministic pseudo-random in [0,1) from a string seed, so per-day spend
// varies believably without Math.random making every render different.
function seeded(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

// The board's stages mapped onto Jake's 12-status model, so the Lead Tracker's
// status column tells the same story as the pipeline board's columns.
const STAGE_TO_STATUS: Record<string, LeadTrackerStatus> = {
  lead_in: "new",
  lead_in_no_appt: "new",
  lead_responded: "contacted",
  no_answer: "phone_follow_up",
  not_qualified: "lost",
  intro_call_waiting: "phone_appt_booked",
  intro_call_booked: "phone_appt_booked",
  intro_call_confirmed: "phone_appt_confirmed",
  handed_off: "handed_off",
  apt_booked: "estimate_booked",
  apt_completed: "estimate_booked",
  estimate_booked: "estimate_booked",
  job_booked: "job_booked",
  won: "won",
  lost: "lost",
  long_term_nurture: "long_term_nurture",
  follow_up: "follow_up",
};

// Which campaign an ad belongs to. Two campaigns so the campaign/ad-set/ad
// level switch actually regroups something, keyed off the ad name so a lead
// always lands in the same campaign.
function campaignOf(adName: string): string {
  return adName === "Spring Clean Special" ? "Spring Promo" : "Always-On Offers";
}

function adsetOf(lead: AdLead): string {
  return `${PLATFORM_META[lead.platform]?.label ?? "Facebook"} Feed`;
}

function demoLeadRows(): LeadTrackerLead[] {
  return PAID_ADS_DEMO.map((lead) => {
    const status = STAGE_TO_STATUS[lead.stage as string] ?? "new";
    return {
      contactId: lead.id,
      opportunityId: `opp_${lead.id}`,
      name: lead.name,
      email: `${lead.name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
      phone: lead.phone,
      createdAt: createdAtOf(lead),
      status,
      when: null,
      // The board already carries a real quote on the leads that have one; use
      // it rather than inventing a second set of numbers.
      value: lead.quote ?? (status === "won" ? 8400 : 0),
      campaignName: campaignOf(lead.adName),
      adsetName: adsetOf(lead),
      adName: lead.adName,
      adId: `ad_${lead.adName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    };
  });
}

function leadsInRange(range: AdTrackerRange): LeadTrackerLead[] {
  const all = demoLeadRows();
  if (range === "maximum") return all;
  const cutoff = ANCHOR.getTime() - rangeDays(range) * 86400_000;
  return all.filter((l) => new Date(l.createdAt).getTime() >= cutoff);
}

const BOOKED_STATUSES: LeadTrackerStatus[] = [
  "estimate_booked",
  "job_booked",
  "phone_appt_booked",
  "phone_appt_confirmed",
  "won",
];

// One row per campaign, ad set or ad. Grouping the SAME leads three ways keeps
// the totals identical at every level, which is what makes the level switch
// trustworthy rather than three unrelated tables.
function breakdownFor(level: AdTrackerLevel, leads: LeadTrackerLead[]): AdTrackerBreakdownRow[] {
  const keyOf = (l: LeadTrackerLead) =>
    level === "campaign" ? l.campaignName : level === "adset" ? l.adsetName : l.adName;

  const groups = new Map<string, LeadTrackerLead[]>();
  for (const l of leads) {
    const k = keyOf(l) ?? "Unattributed";
    const arr = groups.get(k);
    if (arr) arr.push(l);
    else groups.set(k, [l]);
  }

  return Array.from(groups.entries()).map(([name, rows], i) => {
    const spend = rows.length * CPL;
    const bookings = rows.filter((row) => BOOKED_STATUSES.includes(row.status)).length;
    const sales = rows.filter((row) => row.status === "won").length;
    const revenue = rows.reduce((s, row) => s + (row.value ?? 0), 0);
    return {
      id: `${level}-${i}`,
      name,
      spend,
      leads: rows.length,
      bookings,
      sales,
      revenue,
      roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : null,
      costPerLead: rows.length > 0 ? Math.round(spend / rows.length) : null,
      costPerBooking: bookings > 0 ? Math.round(spend / bookings) : null,
      live: i === 0,
    };
  });
}

export function demoLeadTracker(
  range: AdTrackerRange,
  level: AdTrackerLevel,
): LeadTrackerResponse {
  const leads = leadsInRange(range);
  const breakdown = breakdownFor(level, leads);

  const spend = breakdown.reduce((s, b) => s + b.spend, 0);
  const bookings = breakdown.reduce((s, b) => s + b.bookings, 0);
  const sales = breakdown.reduce((s, b) => s + b.sales, 0);
  const revenue = breakdown.reduce((s, b) => s + b.revenue, 0);
  const pickups = leads.filter((l) => l.status !== "new").length;
  const count = leads.length;
  const rate = (n: number, d: number): number | null => (d > 0 ? n / d : null);

  return {
    range,
    level,
    kpis: {
      leads: count,
      // The demo has no Meta feed to disagree with, so every lead it invents is
      // one the CRM also has.
      crmLeads: count,
      pickups,
      bookings,
      sales,
      revenue,
      spend,
      pickupRate: rate(pickups, count),
      bookingRate: rate(bookings, count),
      salesPct: rate(sales, count),
      closeRate: rate(sales, bookings),
      roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : null,
    },
    breakdown,
    unattributed: 0,
    currency: CURRENCY,
    meta: {
      opportunities: count,
      spendDays: Math.min(rangeDays(range), 30),
      timezone: "America/Detroit",
      windowStart: isoDate(new Date(ANCHOR.getTime() - rangeDays(range) * 86400_000)),
      windowEnd: isoDate(ANCHOR),
      neverSynced: false,
      lastSpendDate: isoDate(ANCHOR),
      liveCampaigns: ["Always-On Offers"],
    },
    leads,
  };
}

// Every distinct ad in the demo lead set, with the platform it ran on.
function demoAdCatalogue(): { adName: string; platform: AdLead["platform"] }[] {
  const seen = new Map<string, AdLead["platform"]>();
  for (const lead of PAID_ADS_DEMO) {
    if (!seen.has(lead.adName)) seen.set(lead.adName, lead.platform);
  }
  return Array.from(seen.entries()).map(([adName, platform]) => ({ adName, platform }));
}

// The raw daily per-ad snapshot: 14 days across every demo ad, with spend
// wobbling per day from a seeded hash so the table looks real but is stable.
export function demoMetaData(): MetaDataResponse {
  const rows: MetaDataRow[] = [];
  const ads = demoAdCatalogue();
  for (let dayBack = 13; dayBack >= 0; dayBack--) {
    const date = isoDate(new Date(ANCHOR.getTime() - dayBack * 86400_000));
    for (const ad of ads) {
      const jitter = 0.6 + seeded(`${ad.adName}:${date}`) * 0.8;
      const impressions = Math.round(1400 * jitter);
      rows.push({
        date,
        spend: Math.round(CPL * jitter * 100) / 100,
        impressions,
        reach: Math.round(impressions / 1.8),
        linkClicks: Math.round(impressions * 0.013),
        campaignName: campaignOf(ad.adName),
        campaignId: campaignOf(ad.adName) === "Spring Promo" ? "camp_spring" : "camp_always_on",
        adsetName: `${PLATFORM_META[ad.platform]?.label ?? "Facebook"} Feed`,
        adsetId: `adset_${ad.platform}`,
        adName: ad.adName,
        adId: `ad_${ad.adName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      });
    }
  }
  return { rows, currency: CURRENCY };
}

// A mapped Drive folder with one file per demo ad. `connected: true` so the
// grid renders tiles; thumbnails are null because the demo has no real Drive
// bytes to point at, and the UI already falls back to a type icon for those.
export function demoCreativesFolder(): CreativesFolderResponse {
  return {
    folderId: "demo-folder",
    url: "https://drive.google.com/drive/folders/demo-folder",
    connected: true,
    files: demoAdCatalogue().map((ad, i) => ({
      id: `file_${i}`,
      name: `${ad.adName}.jpg`,
      kind: "image" as const,
      webViewLink: null,
      modifiedTime: new Date(ANCHOR.getTime() - i * 86400_000).toISOString(),
      size: 240_000 + i * 18_000,
      thumbnailUrl: null,
    })),
    error: null,
  };
}

// The ad account's media library: the same assets as the creatives folder.
export function demoAdsMedia(): AdsMediaResponse {
  return {
    configured: true,
    items: demoAdCatalogue().map((ad, i) => ({
      id: `media_${i}`,
      type: "image" as const,
      url: "",
      thumbnail: "",
      name: ad.adName,
      live: true,
    })),
  };
}
