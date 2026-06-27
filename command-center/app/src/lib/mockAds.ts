// Mock paid-ads data for the tracker, shaped exactly like future real data
// (Meta spend + manually-tracked leads). Three clients so the overview has
// variety. Currency is GBP throughout, matching the source sheet. Numbers are
// internally consistent: each ad's meta-row spend sums to its breakdown spend,
// and Sold values drive realistic ROAS. Replace this module when wiring live
// Meta + Supabase data; the types and shapes stay the same.

import type {
  AdsClientData,
  AdsLead,
  LeadStatus,
  MetaRow,
} from "./adsTracker";

// Compact lead builder: fill the attribution + contact defaults, override the
// few fields that matter per row.
function mkLead(
  date: string,
  name: string,
  status: LeadStatus,
  adName: string,
  adId: string,
  opts: { value?: number; info?: string; notes?: string; campaignName?: string; campaignId?: string } = {},
): AdsLead {
  return {
    date,
    name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
    number: "07700 900000",
    info: opts.info ?? "",
    status,
    value: opts.value ?? null,
    notes: opts.notes ?? "",
    campaignName: opts.campaignName ?? "Leads",
    campaignId: opts.campaignId ?? "1201",
    adSetName: "Local Homeowners",
    adSetId: "1202",
    adName,
    adId,
    ghlContact: "",
  };
}

function mkMeta(
  date: string,
  day: string,
  adName: string,
  adId: string,
  spend: number,
  impressions: number,
  reach: number,
  linkClicks: number,
  campaignName: string,
  campaignId: string,
): MetaRow {
  return {
    date,
    spend,
    impressions,
    reach,
    linkClicks,
    ctr: impressions === 0 ? 0 : Number(((linkClicks / impressions) * 100).toFixed(2)),
    day,
    cpm: impressions === 0 ? 0 : Number(((spend / impressions) * 1000).toFixed(2)),
    campaignName,
    campaignId,
    adSetName: "Local Homeowners",
    adSetId: "1202",
    adName,
    adId,
  };
}

// ---------------------------------------------------------------------------
// Client 1: Willis Tree Care (tree surgery / arborist, the sheet's example).
// ---------------------------------------------------------------------------
const willis: AdsClientData = {
  clientId: "willis-tree-care",
  clientName: "Willis Tree Care",
  adAccountId: "80334873",
  niche: "Tree surgery",
  brandColor: "#2f855a",
  brandInitials: "WT",
  ads: [
    { adName: "Oak Removal - Video", adId: "ad-w1", spend: 420 },
    { adName: "Storm Damage - Image", adId: "ad-w2", spend: 260 },
    { adName: "Hedge Trim - Image", adId: "ad-w3", spend: 310 },
    { adName: "Stump Grind - Video", adId: "ad-w4", spend: 180 },
    { adName: "Crown Reduction - Image", adId: "ad-w5", spend: 150 },
  ],
  leads: [
    mkLead("2026-03-21", "Holly Abbott", "Sold", "Hedge Trim - Image", "ad-w3", { value: 6500, info: "Crown reduction on mature beech", notes: "Paid in full" }),
    mkLead("2026-03-21", "Daniel Doyle", "Sold", "Oak Removal - Video", "ad-w1", { value: 4800, info: "Fell 2 conifers + stump grind", notes: "Deposit taken" }),
    mkLead("2026-03-22", "Lisa Frost", "Sending Photos", "Oak Removal - Video", "ad-w1", { info: "Leylandii removal, 12ft run", notes: "Awaiting photos" }),
    mkLead("2026-03-22", "Mark Reilly", "Booked", "Storm Damage - Image", "ad-w2", { info: "Storm-damaged limb over shed", notes: "Survey booked Tue" }),
    mkLead("2026-03-23", "Priya Shah", "Sold", "Stump Grind - Video", "ad-w4", { value: 1500, info: "Two stumps, front garden", notes: "Paid in full" }),
    mkLead("2026-03-23", "Gary Webb", "Call Again", "Hedge Trim - Image", "ad-w3", { info: "Annual hedge cut", notes: "No answer x1" }),
    mkLead("2026-03-24", "Sophie Khan", "Email", "Crown Reduction - Image", "ad-w5", { info: "Crown lift on oak", notes: "Sent quote" }),
    mkLead("2026-03-24", "Tom Hughes", "Lost", "Storm Damage - Image", "ad-w2", { info: "Emergency callout", notes: "Went with competitor" }),
    mkLead("2026-03-25", "Aisha Bello", "Sold", "Oak Removal - Video", "ad-w1", { value: 2200, info: "Sectional dismantle, ash", notes: "Booked for next week" }),
    mkLead("2026-03-25", "Neil Carter", "No Contact", "Hedge Trim - Image", "ad-w3", { info: "Hedge reduction", notes: "No answer x2" }),
    mkLead("2026-03-26", "Emma Stone", "New Lead", "Crown Reduction - Image", "ad-w5", { info: "Quote for crown thin" }),
    mkLead("2026-03-26", "Raj Patel", "Booked", "Stump Grind - Video", "ad-w4", { info: "Large beech stump", notes: "Survey Thu" }),
    mkLead("2026-03-27", "Chloe Dean", "New Lead", "Oak Removal - Video", "ad-w1", { info: "Dead elm, rear garden" }),
    mkLead("2026-03-27", "Owen Pryce", "Sold", "Hedge Trim - Image", "ad-w3", { value: 1800, info: "Conifer hedge takedown", notes: "Paid deposit" }),
  ],
  metaRows: [
    mkMeta("2026-03-21", "Sat", "Oak Removal - Video", "ad-w1", 210, 19800, 15200, 360, "Tree Removal - Leads", "1201"),
    mkMeta("2026-03-22", "Sun", "Oak Removal - Video", "ad-w1", 210, 20100, 15600, 372, "Tree Removal - Leads", "1201"),
    mkMeta("2026-03-21", "Sat", "Storm Damage - Image", "ad-w2", 130, 11200, 9100, 188, "Tree Removal - Leads", "1201"),
    mkMeta("2026-03-22", "Sun", "Storm Damage - Image", "ad-w2", 130, 11000, 8900, 181, "Tree Removal - Leads", "1201"),
    mkMeta("2026-03-21", "Sat", "Hedge Trim - Image", "ad-w3", 155, 13400, 10800, 240, "Hedge & Garden - Leads", "1203"),
    mkMeta("2026-03-22", "Sun", "Hedge Trim - Image", "ad-w3", 155, 13100, 10500, 231, "Hedge & Garden - Leads", "1203"),
    mkMeta("2026-03-21", "Sat", "Stump Grind - Video", "ad-w4", 90, 7600, 6200, 121, "Hedge & Garden - Leads", "1203"),
    mkMeta("2026-03-22", "Sun", "Stump Grind - Video", "ad-w4", 90, 7400, 6000, 118, "Hedge & Garden - Leads", "1203"),
    mkMeta("2026-03-21", "Sat", "Crown Reduction - Image", "ad-w5", 75, 6100, 5000, 92, "Tree Removal - Leads", "1201"),
    mkMeta("2026-03-22", "Sun", "Crown Reduction - Image", "ad-w5", 75, 6000, 4900, 90, "Tree Removal - Leads", "1201"),
  ],
};

// ---------------------------------------------------------------------------
// Client 2: Apex Roofing (roofer). Smaller, fewer sales, leaner ROAS.
// ---------------------------------------------------------------------------
const apex: AdsClientData = {
  clientId: "apex-roofing",
  clientName: "Apex Roofing",
  adAccountId: "44120987",
  niche: "Roofing",
  brandColor: "#b45309",
  brandInitials: "AR",
  ads: [
    { adName: "Flat Roof - Image", adId: "ad-a1", spend: 340 },
    { adName: "Leak Repair - Video", adId: "ad-a2", spend: 280 },
    { adName: "Re-roof Offer - Image", adId: "ad-a3", spend: 210 },
  ],
  leads: [
    mkLead("2026-03-20", "Karen Wills", "Sold", "Leak Repair - Video", "ad-a2", { value: 3200, info: "Valley leak, semi-detached", notes: "Paid in full" }),
    mkLead("2026-03-21", "Joe Bryant", "Booked", "Flat Roof - Image", "ad-a1", { info: "Garage flat roof replace", notes: "Survey Mon" }),
    mkLead("2026-03-22", "Sam Doyle", "Call Again", "Re-roof Offer - Image", "ad-a3", { info: "Full re-roof quote" }),
    mkLead("2026-03-22", "Beth Cole", "Sold", "Flat Roof - Image", "ad-a1", { value: 5400, info: "Extension flat roof", notes: "Deposit taken" }),
    mkLead("2026-03-23", "Ian Frost", "No Contact", "Leak Repair - Video", "ad-a2", { info: "Chimney flashing leak" }),
    mkLead("2026-03-24", "Nadia Roy", "Email", "Re-roof Offer - Image", "ad-a3", { info: "Slate re-roof", notes: "Quote sent" }),
    mkLead("2026-03-25", "Pete Lang", "New Lead", "Flat Roof - Image", "ad-a1", { info: "Porch roof" }),
    mkLead("2026-03-26", "Ruth Vale", "Lost", "Leak Repair - Video", "ad-a2", { info: "Ridge tiles", notes: "Out of budget" }),
  ],
  metaRows: [
    mkMeta("2026-03-20", "Fri", "Flat Roof - Image", "ad-a1", 170, 14500, 11800, 250, "Roofing - Leads", "2101"),
    mkMeta("2026-03-21", "Sat", "Flat Roof - Image", "ad-a1", 170, 14200, 11500, 244, "Roofing - Leads", "2101"),
    mkMeta("2026-03-20", "Fri", "Leak Repair - Video", "ad-a2", 140, 12100, 9800, 205, "Roofing - Leads", "2101"),
    mkMeta("2026-03-21", "Sat", "Leak Repair - Video", "ad-a2", 140, 11900, 9600, 199, "Roofing - Leads", "2101"),
    mkMeta("2026-03-20", "Fri", "Re-roof Offer - Image", "ad-a3", 105, 9100, 7400, 142, "Roofing - Leads", "2101"),
    mkMeta("2026-03-21", "Sat", "Re-roof Offer - Image", "ad-a3", 105, 9000, 7300, 139, "Roofing - Leads", "2101"),
  ],
};

// ---------------------------------------------------------------------------
// Client 3: Coastal Fitness (gym). Lower ticket, higher lead volume feel.
// ---------------------------------------------------------------------------
const coastal: AdsClientData = {
  clientId: "coastal-fitness",
  clientName: "Coastal Fitness",
  adAccountId: "77654321",
  niche: "Fitness",
  brandColor: "#0e7490",
  brandInitials: "CF",
  ads: [
    { adName: "6-Week Challenge - Video", adId: "ad-c1", spend: 220 },
    { adName: "Free Trial - Image", adId: "ad-c2", spend: 160 },
  ],
  leads: [
    mkLead("2026-03-22", "Megan Hart", "Sold", "6-Week Challenge - Video", "ad-c1", { value: 240, info: "6-week challenge signup", notes: "Paid online" }),
    mkLead("2026-03-22", "Liam Ford", "Sold", "Free Trial - Image", "ad-c2", { value: 99, info: "Monthly membership", notes: "Joined" }),
    mkLead("2026-03-23", "Zoe Pratt", "Booked", "6-Week Challenge - Video", "ad-c1", { info: "Intro session booked" }),
    mkLead("2026-03-23", "Dev Anand", "Call Again", "Free Trial - Image", "ad-c2", { info: "Asking about classes" }),
    mkLead("2026-03-24", "Faye Lowe", "Sold", "6-Week Challenge - Video", "ad-c1", { value: 240, info: "6-week challenge signup", notes: "Paid online" }),
    mkLead("2026-03-25", "Owen Tate", "New Lead", "Free Trial - Image", "ad-c2", { info: "Free trial request" }),
  ],
  metaRows: [
    mkMeta("2026-03-22", "Sun", "6-Week Challenge - Video", "ad-c1", 110, 16800, 13900, 410, "Fitness - Leads", "3301"),
    mkMeta("2026-03-23", "Mon", "6-Week Challenge - Video", "ad-c1", 110, 16500, 13600, 398, "Fitness - Leads", "3301"),
    mkMeta("2026-03-22", "Sun", "Free Trial - Image", "ad-c2", 80, 10200, 8400, 233, "Fitness - Leads", "3301"),
    mkMeta("2026-03-23", "Mon", "Free Trial - Image", "ad-c2", 80, 10000, 8200, 228, "Fitness - Leads", "3301"),
  ],
};

export const MOCK_ADS_CLIENTS: AdsClientData[] = [willis, apex, coastal];

export function getMockAdsClient(id: string): AdsClientData | undefined {
  return MOCK_ADS_CLIENTS.find((c) => c.clientId === id);
}
