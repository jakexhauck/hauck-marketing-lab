// Reading a city's coverage. Pure compute, shared by the Cities table and the
// scrape wizard, so the two can never disagree about whether a city has been
// done.
//
// The distinction that matters everywhere here is between a city that is COLD
// and one that is OPEN: worked before, but never for the trade being planned. A
// city scraped for garage doors is still a fresh market for window replacement,
// and until this existed both rendered as a plain green "done".

import type { LeadCity } from "./api";
import { cityKey, type NichePreset } from "./leadScraper";

export type Coverage =
  // Has leads for the trade in question.
  | "leads"
  // Ran for it and found nothing. The row worth not repeating.
  | "empty"
  // Worked for some other trade, never this one. The row worth taking.
  | "open"
  // Never touched by anything.
  | "cold";

export function cityCoverage(c: LeadCity): Coverage {
  if (c.leads > 0) return "leads";
  if (c.runs > 0) return "empty";
  if (c.totalRuns > 0 || c.totalLeads > 0) return "open";
  return "cold";
}

// A niche id reads as "garage_doors" in the run history. Presets carry the real
// label; a niche that has been renamed or deleted since it was run still has to
// render, so the id is tidied rather than dropped.
export function nicheLabels(presets?: NichePreset[]): (id: string) => string {
  const byId = new Map((presets ?? []).map((p) => [p.nicheId, p.label]));
  return (id: string) => {
    const known = byId.get(id);
    if (known) return known;
    const words = id.replace(/[_-]+/g, " ").trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : id;
  };
}

// --- finding a typed city in the coverage list -------------------------------

export interface CityIndex {
  byKey: Map<string, LeadCity>;
  byName: Map<string, LeadCity[]>;
}

export function indexCities(cities: LeadCity[]): CityIndex {
  const byKey = new Map<string, LeadCity>();
  const byName = new Map<string, LeadCity[]>();
  for (const c of cities) {
    if (c.stateCode) byKey.set(cityKey(c.city, c.stateCode), c);
    const name = c.city.trim().toLowerCase();
    const list = byName.get(name);
    if (list) list.push(c);
    else byName.set(name, [c]);
  }
  return { byKey, byName };
}

/**
 * The coverage row for a city as Jake typed it, or null if we have never seen it.
 *
 * With a state, the match is exact: there is a Portland in Oregon and one in
 * Maine, and answering with the wrong one is worse than answering with nothing.
 * Without a state, a single match answers; several matches answer only if
 * exactly one of them has ever been worked, since that is the one Jake means.
 */
export function lookupCity(
  index: CityIndex,
  city: string,
  state: string,
): LeadCity | null {
  if (state) return index.byKey.get(cityKey(city, state)) ?? null;
  const matches = index.byName.get(city.trim().toLowerCase()) ?? [];
  if (matches.length === 1) return matches[0]!;
  const worked = matches.filter((c) => cityCoverage(c) !== "cold");
  return worked.length === 1 ? worked[0]! : null;
}
