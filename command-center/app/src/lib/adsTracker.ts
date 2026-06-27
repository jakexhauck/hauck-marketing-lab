// Pure paid-ads tracker math, mirroring Jake's per-client Google Sheet exactly.
// Two data sources join here: manual lead status + deal value (the Lead Tracker)
// and automatic Meta spend (the META DATA tab). The funnel and per-ad breakdown
// are derived from those. Keeping this a pure module means the same code serves
// mock data today and real Meta + Supabase data later, with the UI untouched.
//
// Metric definitions are copied verbatim from the sheet legend:
//   Leads     = all leads in range.
//   Pickups   = leads contacted (anything past New Lead / No Contact).
//   Bookings  = Booked + Sold + Lost.  Booking Rate = Bookings / Leads.
//   Sales     = leads marked Sold.  Revenue = total Value of Sold leads.
//   ROAS      = Revenue / Ad Spend.
//   Pickup Rate = Pickups / Leads.  Sales % = Sales / Leads.
//   Close Rate  = Sales / Bookings.  Cost/Lead = Spend / Leads.
//   Cost/Booking = Spend / Bookings.

export type LeadStatus =
  | "New Lead"
  | "No Contact"
  | "Call Again"
  | "Email"
  | "Sending Photos"
  | "Booked"
  | "Sold"
  | "Lost";

// The eight statuses in display order, for the Lead Tracker dropdown.
export const LEAD_STATUSES: LeadStatus[] = [
  "New Lead",
  "No Contact",
  "Call Again",
  "Email",
  "Sending Photos",
  "Booked",
  "Sold",
  "Lost",
];

export interface AdsLead {
  date: string;
  name: string;
  email: string;
  number: string;
  info: string;
  status: LeadStatus;
  value: number | null; // the deal size, set on Sold (and optionally Booked/Lost)
  notes: string;
  campaignName: string;
  campaignId: string;
  adSetName: string;
  adSetId: string;
  adName: string;
  adId: string;
  ghlContact: string; // reserved for a GoHighLevel contact link; blank for now
}

export interface AdsAd {
  adName: string;
  adId: string;
  spend: number;
}

export interface MetaRow {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  linkClicks: number;
  ctr: number;
  day: string; // weekday name, e.g. "Sat"
  cpm: number;
  campaignName: string;
  campaignId: string;
  adSetName: string;
  adSetId: string;
  adName: string;
  adId: string;
}

export interface AdsClientData {
  clientId: string;
  clientName: string;
  adAccountId: string;
  niche?: string;
  brandColor?: string;
  brandInitials?: string;
  leads: AdsLead[];
  ads: AdsAd[];
  metaRows: MetaRow[];
}

export interface Funnel {
  leads: number;
  pickups: number;
  pickupRate: number;
  bookings: number;
  bookingRate: number;
  sales: number;
  salesPctOfLeads: number;
  closeRate: number;
  revenue: number;
  adSpend: number;
  roas: number;
}

export interface AdBreakdownRow {
  adName: string;
  adId: string;
  spend: number;
  leads: number;
  bookings: number;
  sales: number;
  revenue: number;
  roas: number;
  costPerLead: number;
  costPerBooking: number;
}

// Safe ratio: 0 when the denominator is 0 (no NaN, no Infinity).
function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

const NOT_PICKED_UP: LeadStatus[] = ["New Lead", "No Contact"];
const BOOKING_STATUSES: LeadStatus[] = ["Booked", "Sold", "Lost"];

function isPickup(lead: AdsLead): boolean {
  return !NOT_PICKED_UP.includes(lead.status);
}
function isBooking(lead: AdsLead): boolean {
  return BOOKING_STATUSES.includes(lead.status);
}
function isSale(lead: AdsLead): boolean {
  return lead.status === "Sold";
}

export function totalSpend(metaRows: MetaRow[]): number {
  return metaRows.reduce((sum, r) => sum + r.spend, 0);
}

export function computeFunnel(data: AdsClientData): Funnel {
  const leads = data.leads.length;
  const pickups = data.leads.filter(isPickup).length;
  const bookings = data.leads.filter(isBooking).length;
  const sales = data.leads.filter(isSale).length;
  const revenue = data.leads
    .filter(isSale)
    .reduce((sum, l) => sum + (l.value ?? 0), 0);
  const adSpend = totalSpend(data.metaRows);

  return {
    leads,
    pickups,
    pickupRate: ratio(pickups, leads),
    bookings,
    bookingRate: ratio(bookings, leads),
    sales,
    salesPctOfLeads: ratio(sales, leads),
    closeRate: ratio(sales, bookings),
    revenue,
    adSpend,
    roas: ratio(revenue, adSpend),
  };
}

export function computeAdBreakdown(data: AdsClientData): AdBreakdownRow[] {
  return data.ads.map((ad) => {
    const adLeads = data.leads.filter((l) => l.adId === ad.adId);
    const leads = adLeads.length;
    const bookings = adLeads.filter(isBooking).length;
    const sales = adLeads.filter(isSale).length;
    const revenue = adLeads
      .filter(isSale)
      .reduce((sum, l) => sum + (l.value ?? 0), 0);
    return {
      adName: ad.adName,
      adId: ad.adId,
      spend: ad.spend,
      leads,
      bookings,
      sales,
      revenue,
      roas: ratio(revenue, ad.spend),
      costPerLead: ratio(ad.spend, leads),
      costPerBooking: ratio(ad.spend, bookings),
    };
  });
}

// Sum many clients' funnels into one agency-wide rollup (the overview totals).
// ROAS is blended (total revenue / total spend), not averaged.
export function sumFunnels(funnels: Funnel[]): Funnel {
  const acc = funnels.reduce(
    (a, f) => ({
      leads: a.leads + f.leads,
      pickups: a.pickups + f.pickups,
      bookings: a.bookings + f.bookings,
      sales: a.sales + f.sales,
      revenue: a.revenue + f.revenue,
      adSpend: a.adSpend + f.adSpend,
    }),
    { leads: 0, pickups: 0, bookings: 0, sales: 0, revenue: 0, adSpend: 0 },
  );
  return {
    ...acc,
    pickupRate: ratio(acc.pickups, acc.leads),
    bookingRate: ratio(acc.bookings, acc.leads),
    salesPctOfLeads: ratio(acc.sales, acc.leads),
    closeRate: ratio(acc.sales, acc.bookings),
    roas: ratio(acc.revenue, acc.adSpend),
  };
}
