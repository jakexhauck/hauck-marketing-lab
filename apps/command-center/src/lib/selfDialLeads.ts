import type { LeadTrackerLead } from "./api";

// The self-dial Leads page's pure bits, kept out of the component so they are
// testable without rendering it.

export function sortNewestFirst(leads: LeadTrackerLead[]): LeadTrackerLead[] {
  return [...leads].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export interface SelfDialStats {
  total: number;
  // Still New: nobody has recorded anything on them. The number that says
  // whether the owner is working the leads at all.
  untouched: number;
  won: number;
  revenue: number;
}

export function selfDialStats(leads: LeadTrackerLead[]): SelfDialStats {
  let untouched = 0;
  let won = 0;
  let revenue = 0;
  for (const l of leads) {
    if (l.status === "new") untouched++;
    if (l.status === "won") {
      won++;
      revenue += l.value ?? 0;
    }
  }
  return { total: leads.length, untouched, won, revenue };
}
