import { describe, it, expect } from "vitest";
import {
  cityCoverage,
  indexCities,
  lookupCity,
  nicheLabels,
} from "./cityCoverage";
import type { LeadCity } from "./api";

// A city is never simply "done". It is done FOR SOMETHING. Everything here
// exists to keep that distinction visible: a city scraped for garage doors is
// still a fresh market for window replacement, and one merged count made the
// two look identical on the only screen that plans the next run.

function city(over: Partial<LeadCity> = {}): LeadCity {
  return {
    rank: null,
    city: "Los Gatos",
    stateName: "California",
    stateCode: "CA",
    population: null,
    growthPct: null,
    runs: 0,
    lastRunAt: null,
    leads: 0,
    totalRuns: 0,
    totalLeads: 0,
    niches: [],
    ...over,
  };
}

const trade = nicheLabels([
  {
    id: "1",
    nicheId: "garage_doors",
    label: "Garage doors",
    builtIn: true,
    summary: { keywords: 1, denyTerms: 0, coreCategories: 0, nameSignals: 0, threshold: 50 },
    updatedAt: "",
  },
]);

describe("reading one city's coverage", () => {
  it("calls a city worked for another trade OPEN, not done", () => {
    const c = city({ runs: 0, leads: 0, totalRuns: 1, niches: ["garage_doors"] });
    expect(cityCoverage(c)).toBe("open");
  });

  it("calls a city with leads for this trade done", () => {
    expect(cityCoverage(city({ leads: 4, totalLeads: 4 }))).toBe("leads");
  });

  it("separates ran-and-found-nothing from never-touched", () => {
    expect(cityCoverage(city({ runs: 1, totalRuns: 1 }))).toBe("empty");
    expect(cityCoverage(city())).toBe("cold");
  });
});

describe("naming a trade", () => {
  it("prefers the preset's own label", () => {
    expect(trade("garage_doors")).toBe("Garage doors");
  });

  // A niche that was renamed or deleted still has runs in the history, so it
  // still has to render as something a person can read.
  it("tidies an id no preset knows about", () => {
    expect(trade("windows_doors")).toBe("Windows doors");
  });
});

describe("finding a typed city", () => {
  const index = indexCities([
    city({ city: "Portland", stateCode: "OR", runs: 2, totalRuns: 2 }),
    city({ city: "Portland", stateCode: "ME" }),
    city({ city: "Boise", stateCode: "ID", runs: 1, totalRuns: 1 }),
  ]);

  it("matches on the state when one was typed", () => {
    expect(lookupCity(index, "Portland", "ME")!.runs).toBe(0);
    expect(lookupCity(index, "portland", "or")!.runs).toBe(2);
  });

  it("answers a stateless city when only one of that name has been worked", () => {
    expect(lookupCity(index, "Portland", "")!.stateCode).toBe("OR");
    expect(lookupCity(index, "Boise", "")!.runs).toBe(1);
  });

  it("says nothing rather than guessing a state we do not have", () => {
    expect(lookupCity(index, "Portland", "TX")).toBeNull();
    expect(lookupCity(index, "Plano", "")).toBeNull();
  });
});
