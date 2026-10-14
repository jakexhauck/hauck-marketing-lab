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
  // Days from now for the When column: positive is upcoming, negative is past
  // (which renders a follow-up as overdue). Omitted where the status carries no
  // date, exactly as the live payload behaves.
  whenInDays?: number;
  whenLabel?: string;
}

// Which side of the When column a status draws from. Mirrors leadWhen.ts on the
// server; the sample rows must behave the way the real ones will.
const APPOINTMENT_STATUSES: ReadonlySet<LeadTrackerLead["status"]> = new Set([
  "phone_appt_booked",
  "phone_appt_confirmed",
  "estimate_booked",
  "job_booked",
]);

// One seed per status in the 12-status model, newest first, so every chip and
// every "when" case can be judged on the page before live leads flow.
const SEEDS: Seed[] = [
  { name: "Marcus Webb", phone: "(248) 555-0142", email: "marcus.webb@gmail.com", status: "new", value: 0, ad: "B&A 1 | $100 OFF | 7/15/2026", daysAgo: 0 },
  { name: "Dana Liu", phone: "(313) 555-0188", email: "dana.liu@yahoo.com", status: "phone_follow_up", value: 0, ad: "Video 2 | $100 OFF | 7/15/2026", daysAgo: 1, whenInDays: 1, whenLabel: "Call back" },
  { name: "Priya Shah", phone: "(248) 555-0119", email: "priya.shah@outlook.com", status: "contacted", value: 0, ad: "B&A 1 | $100 OFF | 7/15/2026", daysAgo: 2 },
  { name: "Tom Becker", phone: "(586) 555-0173", email: "tbecker@gmail.com", status: "phone_appt_booked", value: 0, ad: "Video 1 | $100 OFF | 7/15/2026", daysAgo: 3, whenInDays: 2, whenLabel: "Phone Appointment" },
  { name: "Angela Ruiz", phone: "(734) 555-0126", email: "angela.ruiz@gmail.com", status: "phone_appt_confirmed", value: 0, ad: "B&A 1 | $100 OFF | 7/15/2026", daysAgo: 4, whenInDays: 3, whenLabel: "Phone Appointment" },
  { name: "Kevin O'Brien", phone: "(248) 555-0164", email: "kobrien@comcast.net", status: "handed_off", value: 0, ad: "Video 2 | $100 OFF | 7/15/2026", daysAgo: 5 },
  { name: "The Garcias", phone: "(313) 555-0151", email: "garcia.home@gmail.com", status: "estimate_booked", value: 0, ad: "B&A 1 | $100 OFF | 7/15/2026", daysAgo: 6, whenInDays: 5, whenLabel: "Home Estimate" },
  { name: "Susan Feldman", phone: "(248) 555-0135", email: "sfeldman@yahoo.com", status: "job_booked", value: 0, ad: "Video 1 | $100 OFF | 7/15/2026", daysAgo: 8, whenInDays: 9, whenLabel: "Window Cleaning Service" },
  { name: "Rob Deluca", phone: "(586) 555-0197", email: "rdeluca@gmail.com", status: "won", value: 390, ad: "Video 2 | $100 OFF | 7/15/2026", daysAgo: 11 },
  { name: "Nina Holt", phone: "(734) 555-0108", email: "nina.holt@outlook.com", status: "follow_up", value: 0, ad: "B&A 1 | $100 OFF | 7/15/2026", daysAgo: 13, whenInDays: -2, whenLabel: "Owner follow up" },
  { name: "Derek Palmer", phone: "(248) 555-0182", email: "dpalmer@gmail.com", status: "lost", value: 0, ad: "Video 1 | $100 OFF | 7/15/2026", daysAgo: 16 },
  { name: "Holly Abbott", phone: "(313) 555-0170", email: "holly.abbott@gmail.com", status: "long_term_nurture", value: 0, ad: "Video 2 | $100 OFF | 7/15/2026", daysAgo: 19, whenInDays: 30, whenLabel: "Nurture check-in" },
];

// Built once at module load. Dates are stamped relative to now so the rows sit
// inside the "All Time" and 30-day ranges the tracker offers.
export const SAMPLE_LEADS: LeadTrackerLead[] = SEEDS.map((s, i) => {
  const d = new Date();
  d.setDate(d.getDate() - s.daysAgo);

  let when: LeadTrackerLead["when"] = null;
  if (s.whenInDays !== undefined) {
    const w = new Date();
    w.setDate(w.getDate() + s.whenInDays);
    // A tidy hour, so the sample rows do not print whatever minute it is now.
    w.setHours(s.whenInDays % 2 === 0 ? 14 : 10, 30, 0, 0);
    when = {
      at: w.toISOString(),
      kind: APPOINTMENT_STATUSES.has(s.status) ? "appointment" : "follow_up",
      label: s.whenLabel ?? "",
    };
  }

  return {
    when,
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
