import type { LeadTrackerLead } from "../../lib/api";

// Sample leads for the Lead Tracker, shown only when there are no real leads
// (and clearly badged as sample). This lets the page be judged with data in it
// before live leads flow; it is never mixed with real leads and never shipped
// as real. Ad and campaign names mirror the client's real Meta snapshot so the
// attribution column looks true to life.

const CAMPAIGN = "7/15/26 | Lead Form | Willis Windows";
const ADSET = "7/15/26 | Images & Videos";

interface Seed {
  name: string;
  phone: string;
  email: string;
  status: LeadTrackerLead["status"];
  value: number;
  ad: string;
  daysAgo: number;
}

const SEEDS: Seed[] = [
  { name: "Marcus Webb", phone: "(248) 555-0142", email: "marcus.webb@gmail.com", status: "new", value: 0, ad: "B&A 1 | $100 OFF | 7/15/2026", daysAgo: 0 },
  { name: "Dana Liu", phone: "(313) 555-0188", email: "dana.liu@yahoo.com", status: "new", value: 0, ad: "Video 2 | $100 OFF | 7/15/2026", daysAgo: 1 },
  { name: "Priya Shah", phone: "(248) 555-0119", email: "priya.shah@outlook.com", status: "contacted", value: 0, ad: "B&A 1 | $100 OFF | 7/15/2026", daysAgo: 2 },
  { name: "Tom Becker", phone: "(586) 555-0173", email: "tbecker@gmail.com", status: "contacted", value: 0, ad: "Video 1 | $100 OFF | 7/15/2026", daysAgo: 3 },
  { name: "Angela Ruiz", phone: "(734) 555-0126", email: "angela.ruiz@gmail.com", status: "booked", value: 0, ad: "B&A 1 | $100 OFF | 7/15/2026", daysAgo: 4 },
  { name: "Kevin O'Brien", phone: "(248) 555-0164", email: "kobrien@comcast.net", status: "booked", value: 0, ad: "Video 2 | $100 OFF | 7/15/2026", daysAgo: 5 },
  { name: "The Garcias", phone: "(313) 555-0151", email: "garcia.home@gmail.com", status: "sold", value: 480, ad: "B&A 1 | $100 OFF | 7/15/2026", daysAgo: 6 },
  { name: "Susan Feldman", phone: "(248) 555-0135", email: "sfeldman@yahoo.com", status: "sold", value: 650, ad: "Video 1 | $100 OFF | 7/15/2026", daysAgo: 8 },
  { name: "Rob Deluca", phone: "(586) 555-0197", email: "rdeluca@gmail.com", status: "sold", value: 390, ad: "Video 2 | $100 OFF | 7/15/2026", daysAgo: 11 },
  { name: "Nina Holt", phone: "(734) 555-0108", email: "nina.holt@outlook.com", status: "lost", value: 0, ad: "B&A 1 | $100 OFF | 7/15/2026", daysAgo: 13 },
  { name: "Derek Palmer", phone: "(248) 555-0182", email: "dpalmer@gmail.com", status: "lost", value: 0, ad: "Video 1 | $100 OFF | 7/15/2026", daysAgo: 16 },
  { name: "Holly Abbott", phone: "(313) 555-0170", email: "holly.abbott@gmail.com", status: "contacted", value: 0, ad: "Video 2 | $100 OFF | 7/15/2026", daysAgo: 19 },
];

// Built once at module load. Dates are stamped relative to now so the rows sit
// inside the "All Time" and 30-day ranges the tracker offers.
export const SAMPLE_LEADS: LeadTrackerLead[] = SEEDS.map((s, i) => {
  const d = new Date();
  d.setDate(d.getDate() - s.daysAgo);
  return {
    contactId: `sample-${i}`,
    opportunityId: null,
    name: s.name,
    email: s.email,
    phone: s.phone,
    createdAt: d.toISOString(),
    status: s.status,
    value: s.value,
    campaignName: CAMPAIGN,
    adsetName: ADSET,
    adName: s.ad,
    adId: `sample-ad-${s.ad}`,
  };
});
