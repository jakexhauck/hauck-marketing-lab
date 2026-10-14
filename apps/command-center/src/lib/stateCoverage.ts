// Rolling the city coverage list up to whole states, so the map can be read
// before anything is clicked.
//
// The map answers a coarser question than the table under it. The table says
// "have we done Gig Harbor for garage doors"; the map only has to say "is
// Washington worth opening at all", and it has to say it in one colour on a
// shape the size of a fingernail.
//
// Depth is driven by LEADS rather than by runs. A run that found nothing is not
// coverage, it is a lesson, and a state painted dark for six empty runs would
// send Jake away from the one place still worth scraping. Runs are still carried
// on the row so the tooltip can tell the difference.

import type { LeadCity } from "./api";
import { cityCoverage } from "./cityCoverage";

export type CoverageLevel = "cold" | "started" | "worked" | "heavy";

// Absolute, not relative to the busiest state. Quartiles would repaint the whole
// map every time a trade is switched, so a state with eleven leads would go from
// pale to solid purely because the trade beside it is younger. A number that
// means the same thing on every screen is worth more than a prettier spread.
//
// Sized against what a run actually returns: roughly thirty to sixty kept leads
// per city, so "started" is a city or two, and "heavy" is a state that has been
// properly worked over.
export const LEAD_THRESHOLDS = { worked: 100, heavy: 500 } as const;

export interface StateCoverage {
  code: string;
  /** Scoped to the selected trade. */
  runs: number;
  leads: number;
  /** Cities in this state that carry leads for the trade. */
  citiesWithLeads: number;
  /** Cities in this state the coverage list knows about at all. */
  cities: number;
  level: CoverageLevel;
  /**
   * Worked for some other trade, never for this one. The state worth taking, and
   * the reason this is a separate flag rather than another depth: it is cold by
   * every count on the row, but it is not a cold market.
   */
  openForTrade: boolean;
}

function levelOf(leads: number, runs: number): CoverageLevel {
  if (leads >= LEAD_THRESHOLDS.heavy) return "heavy";
  if (leads >= LEAD_THRESHOLDS.worked) return "worked";
  // A run with nothing to show still counts as started. It is not a market we
  // have taken, but it is one we have spent on, and hiding that invites paying
  // for the same silence twice.
  if (leads > 0 || runs > 0) return "started";
  return "cold";
}

/**
 * Every state the coverage list mentions, keyed by two-letter code.
 *
 * States with nothing at all are absent rather than present-and-zero. The map
 * draws all fifty-one shapes from its own path data and treats a missing key as
 * cold, so building empty rows here would only be a second place for the same
 * default to drift.
 */
export function rollUpStates(cities: LeadCity[]): Map<string, StateCoverage> {
  const out = new Map<string, StateCoverage>();
  for (const c of cities) {
    const code = (c.stateCode ?? "").trim().toUpperCase();
    if (!code) continue;
    let row = out.get(code);
    if (!row) {
      row = {
        code,
        runs: 0,
        leads: 0,
        citiesWithLeads: 0,
        cities: 0,
        level: "cold",
        openForTrade: false,
      };
      out.set(code, row);
    }
    row.cities += 1;
    row.runs += c.runs;
    row.leads += c.leads;
    if (c.leads > 0) row.citiesWithLeads += 1;
    if (cityCoverage(c) === "open") row.openForTrade = true;
  }
  for (const row of out.values()) {
    row.level = levelOf(row.leads, row.runs);
    // Only a state with nothing of its own for this trade can be "open". Once a
    // single city has been run for it the state is started, and a dashed outline
    // saying otherwise would contradict its own fill.
    if (row.level !== "cold") row.openForTrade = false;
  }
  return out;
}
