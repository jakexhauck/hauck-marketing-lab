// ===========================================================================
// Customers, the roster of contacts who have booked or paid at least one
// job. A customer is either "recurring" (has an active schedule, layered on
// via a RecurrenceRule) or "onetime". Demo data below mirrors the mockup
// fixture at docs/mockups/customers-v1/data.js and reuses the same Willis
// Windows names/phones/services as src/lib/jobsPipeline.ts so Jobs +
// Customers read as one dataset. Money in Customer/CustomerJob is whole
// dollars; DEMO_RECURRENCE prices are integer cents (source of truth for the
// scheduled rate, which can differ from historical job amounts).
// ===========================================================================

import { nextVisit, type RecurrenceRule } from "./recurrence";

export interface CustomerJob {
  id: string;
  date: string; // "YYYY-MM-DD"
  service: string;
  amount: number; // whole dollars
  paid: boolean;
}

export interface Customer {
  id: string;
  name: string;
  business: string | null;
  phone: string;
  email: string;
  city: string;
  lifetimeValue: number; // whole dollars
  jobCount: number;
  lastJobAt: string; // "YYYY-MM-DD"
  jobs: CustomerJob[];
}

export type CustomerSegment = "recurring" | "onetime";

export interface CustomerWithSchedule extends Customer {
  segment: CustomerSegment;
  rule: RecurrenceRule | null;
  service: string | null;
  priceCents: number | null;
  nextVisit: string | null;
}

// Layer a recurrence rule onto a customer to derive its segment + next visit.
export function applySchedule(
  c: Customer,
  rule: RecurrenceRule | null,
  opts: { service?: string | null; priceCents?: number | null; todayIso: string },
): CustomerWithSchedule {
  const active = rule !== null;
  return {
    ...c,
    segment: active ? "recurring" : "onetime",
    rule,
    service: opts.service ?? null,
    priceCents: opts.priceCents ?? null,
    nextVisit: active ? nextVisit(rule as RecurrenceRule, opts.todayIso) : null,
  };
}

// Per-customer job history, most recent first, mirroring the mockup's
// historyFor(): up to 6 entries, most recent = lastJobAt, older entries drawn
// from a fixed lookback list (demo data only, not chronologically precise).
function history(custId: string, lastJobAt: string, service: string, price: number, jobCount: number): CustomerJob[] {
  const olderDates = ["2026-05-27", "2026-04-29", "2026-04-01", "2026-03-04", "2026-02-05"];
  const n = Math.min(jobCount, 6);
  const out: CustomerJob[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `${custId}-j${i + 1}`,
      date: i === 0 ? lastJobAt : olderDates[Math.min(i - 1, olderDates.length - 1)],
      service,
      amount: price,
      paid: true,
    });
  }
  return out;
}

// DEMO_CUSTOMERS: ported verbatim from docs/mockups/customers-v1/data.js
// (CUSTOMERS array), same names/cities/services/prices/cadence/weekday as
// jobsPipeline.ts's DEMO_JOBS. Recurring ids cust-01..cust-07 (fixture rows
// 1-7); one-time ids cust-08..cust-14 (fixture rows 8-14). Display dates like
// "Jun 8" are converted to 2026 ISO ("2026-06-08").
export const DEMO_CUSTOMERS: Customer[] = [
  {
    id: "cust-01", name: "Aaron Webb", business: "Ferndale Cafe", phone: "(248) 555-0121",
    email: "aaron@ferndalecafe.com", city: "Ferndale", lifetimeValue: 2880, jobCount: 12,
    lastJobAt: "2026-06-08",
    jobs: history("cust-01", "2026-06-08", "Storefront glass + entry", 240, 12),
  },
  {
    id: "cust-02", name: "Sofia Russo", business: null, phone: "(248) 555-0177",
    email: "sofia.russo@gmail.com", city: "Bloomfield", lifetimeValue: 4050, jobCount: 6,
    lastJobAt: "2026-06-11",
    jobs: history("cust-02", "2026-06-11", "2-story full house + skylights", 675, 6),
  },
  {
    id: "cust-03", name: "Aaron Delgado", business: "Royal Oak Dental", phone: "(248) 555-0158",
    email: "office@rodental.com", city: "Royal Oak", lifetimeValue: 3240, jobCount: 18,
    lastJobAt: "2026-06-24",
    jobs: history("cust-03", "2026-06-24", "Office exterior, ground floor", 180, 18),
  },
  {
    id: "cust-04", name: "Lena Cho", business: null, phone: "(248) 555-0166",
    email: "lena.cho@gmail.com", city: "Berkley", lifetimeValue: 1920, jobCount: 12,
    lastJobAt: "2026-06-27",
    jobs: history("cust-04", "2026-06-27", "Exterior + screen wipe-down", 160, 12),
  },
  {
    id: "cust-05", name: "Priya Nair", business: null, phone: "(248) 555-0151",
    email: "priya.nair@gmail.com", city: "Rochester Hills", lifetimeValue: 2350, jobCount: 5,
    lastJobAt: "2026-06-09",
    jobs: history("cust-05", "2026-06-09", "Full house exterior", 470, 5),
  },
  {
    id: "cust-06", name: "Marcus Bell", business: "Bell & Co Realty", phone: "(248) 555-0112",
    email: "marcus@bellco.com", city: "Troy", lifetimeValue: 5760, jobCount: 48,
    lastJobAt: "2026-07-01",
    jobs: history("cust-06", "2026-07-01", "Showroom front, weekly", 120, 48),
  },
  {
    id: "cust-07", name: "Olivia Grant", business: null, phone: "(248) 555-0145",
    email: "olivia.grant@gmail.com", city: "Clawson", lifetimeValue: 1640, jobCount: 4,
    lastJobAt: "2026-06-16",
    jobs: history("cust-07", "2026-06-16", "Full exterior + gutters", 410, 4),
  },
  {
    id: "cust-08", name: "Dana Park", business: null, phone: "(586) 555-0148",
    email: "dana.park@gmail.com", city: "Warren", lifetimeValue: 520, jobCount: 1,
    lastJobAt: "2026-06-30",
    jobs: history("cust-08", "2026-06-30", "Full exterior + screens", 520, 1),
  },
  {
    id: "cust-09", name: "Greg Olsen", business: null, phone: "(586) 555-0193",
    email: "greg.olsen@gmail.com", city: "Sterling Heights", lifetimeValue: 410, jobCount: 1,
    lastJobAt: "2026-07-01",
    jobs: history("cust-09", "2026-07-01", "Exterior windows, 1-story", 410, 1),
  },
  {
    id: "cust-10", name: "Kevin Lee", business: null, phone: "(248) 555-0139",
    email: "kevin.lee@icloud.com", city: "Birmingham", lifetimeValue: 600, jobCount: 1,
    lastJobAt: "2026-06-22",
    jobs: history("cust-10", "2026-06-22", "2-story full house, in + out", 600, 1),
  },
  {
    id: "cust-11", name: "Maria Santos", business: null, phone: "(248) 555-0158",
    email: "maria.santos@gmail.com", city: "Royal Oak", lifetimeValue: 760, jobCount: 2,
    lastJobAt: "2026-05-30",
    jobs: history("cust-11", "2026-05-30", "Exterior + gutter clear", 380, 2),
  },
  {
    id: "cust-12", name: "Carl Jensen", business: null, phone: "(248) 555-0173",
    email: "carl.jensen@yahoo.com", city: "Madison Heights", lifetimeValue: 290, jobCount: 1,
    lastJobAt: "2026-06-03",
    jobs: history("cust-12", "2026-06-03", "Exterior, single story", 290, 1),
  },
  {
    id: "cust-13", name: "Nina Patel", business: null, phone: "(248) 555-0168",
    email: "nina.patel@gmail.com", city: "Bloomfield", lifetimeValue: 540, jobCount: 1,
    lastJobAt: "2026-05-18",
    jobs: history("cust-13", "2026-05-18", "2-story exterior + skylights", 540, 1),
  },
  {
    id: "cust-14", name: "Dana Whitfield", business: "Whitfield Interiors", phone: "(248) 555-0190",
    email: "hello@whitfield.co", city: "Birmingham", lifetimeValue: 1240, jobCount: 2,
    lastJobAt: "2026-04-28",
    jobs: history("cust-14", "2026-04-28", "Showroom deep clean", 620, 2),
  },
];

// DEMO_RECURRENCE: the demo seed for the recurring subset (cust-01..cust-07),
// keyed by customer id. weekday/cadence/anchor mirror the fixture's
// cadence + weekday + next (converted to 2026 ISO); priceCents = price * 100.
export const DEMO_RECURRENCE: Record<
  string,
  { rule: RecurrenceRule; service: string; priceCents: number }
> = {
  "cust-01": {
    rule: { cadenceWeeks: 4, weekday: 1, anchorDate: "2026-07-06" },
    service: "Storefront glass + entry",
    priceCents: 24000,
  },
  "cust-02": {
    rule: { cadenceWeeks: 4, weekday: 4, anchorDate: "2026-07-09" },
    service: "2-story full house + skylights",
    priceCents: 67500,
  },
  "cust-03": {
    rule: { cadenceWeeks: 2, weekday: 2, anchorDate: "2026-07-07" },
    service: "Office exterior, ground floor",
    priceCents: 18000,
  },
  "cust-04": {
    rule: { cadenceWeeks: 2, weekday: 5, anchorDate: "2026-07-10" },
    service: "Exterior + screen wipe-down",
    priceCents: 16000,
  },
  "cust-05": {
    rule: { cadenceWeeks: 4, weekday: 1, anchorDate: "2026-07-06" },
    service: "Full house exterior",
    priceCents: 47000,
  },
  "cust-06": {
    rule: { cadenceWeeks: 1, weekday: 3, anchorDate: "2026-07-08" },
    service: "Showroom front, weekly",
    priceCents: 12000,
  },
  "cust-07": {
    rule: { cadenceWeeks: 4, weekday: 2, anchorDate: "2026-07-14" },
    service: "Full exterior + gutters",
    priceCents: 41000,
  },
};
