import { describe, it, expect } from "vitest";
import {
  cityCoverage,
  cityNote,
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

const label = nicheLabels([
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

describe("the marker beside a city in the wizard", () => {
  it("says nothing about a city nobody has ever worked", () => {
    expect(cityNote(city(), label)).toBeNull();
    expect(cityNote(null, label)).toBeNull();
  });

  it("names the other trades when the city is still open for this one", () => {
    const note = cityNote(city({ totalRuns: 1, niches: ["garage_doors"] }), label)!;
    expect(note.tone).toBe("open");
    expect(note.text).toBe("Garage doors");
  });

  // Midday, not midnight: the date is rendered in Jake's own timezone, so a UTC
  // midnight stamp is honestly the evening before and would make this test read
  // as a bug on a machine set to anywhere west of London.
  it("says what was found and when, for a city already done for this trade", () => {
    const note = cityNote(
      city({ leads: 12, totalLeads: 12, lastRunAt: "2026-08-21T12:00:00Z" }),
      label,
    )!;
    expect(note.tone).toBe("leads");
    expect(note.text).toBe("12 leads, 21 Aug");
  });

  it("still reads a trade that no preset knows about", () => {
    const note = cityNote(city({ totalRuns: 1, niches: ["windows_doors"] }), label)!;
    expect(note.text).toBe("Windows doors");
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
