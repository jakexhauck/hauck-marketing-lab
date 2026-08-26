import { describe, expect, it } from "vitest";
import { rollUpStates, LEAD_THRESHOLDS } from "./stateCoverage";
import type { LeadCity } from "./api";

function city(over: Partial<LeadCity> = {}): LeadCity {
  return {
    rank: null,
    city: "Somewhere",
    stateName: "Washington",
    stateCode: "WA",
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

describe("rollUpStates", () => {
  it("sums runs, leads and cities per state", () => {
    const rows = rollUpStates([
      city({ city: "Seattle", stateCode: "WA", runs: 2, leads: 40 }),
      city({ city: "Tacoma", stateCode: "WA", runs: 1, leads: 12 }),
      city({ city: "Austin", stateCode: "TX", runs: 1, leads: 9 }),
    ]);
    expect(rows.get("WA")).toMatchObject({
      runs: 3,
      leads: 52,
      cities: 2,
      citiesWithLeads: 2,
    });
    expect(rows.get("TX")).toMatchObject({ runs: 1, leads: 9, cities: 1 });
  });

  it("leaves a state with nothing out of the map entirely", () => {
    const rows = rollUpStates([city({ stateCode: "WA", leads: 5, runs: 1 })]);
    expect(rows.has("OR")).toBe(false);
  });

  it("counts only the cities that actually carry leads", () => {
    const rows = rollUpStates([
      city({ city: "Seattle", leads: 40 }),
      city({ city: "Tacoma", leads: 0, runs: 1 }),
    ]);
    expect(rows.get("WA")).toMatchObject({ cities: 2, citiesWithLeads: 1 });
  });

  describe("depth", () => {
    it("is cold when nothing has been done", () => {
      const rows = rollUpStates([city()]);
      expect(rows.get("WA")!.level).toBe("cold");
    });

    // The lesson a run teaches is worth showing. A state we spent a run on and
    // got nothing from must not read the same as one nobody has opened.
    it("is started when a run found nothing", () => {
      const rows = rollUpStates([city({ runs: 3, leads: 0 })]);
      expect(rows.get("WA")!.level).toBe("started");
    });

    it("climbs with leads, not with runs", () => {
      const many = rollUpStates([city({ runs: 40, leads: 1 })]);
      expect(many.get("WA")!.level).toBe("started");

      const worked = rollUpStates([city({ runs: 1, leads: LEAD_THRESHOLDS.worked })]);
      expect(worked.get("WA")!.level).toBe("worked");

      const heavy = rollUpStates([city({ runs: 1, leads: LEAD_THRESHOLDS.heavy })]);
      expect(heavy.get("WA")!.level).toBe("heavy");
    });

    it("puts the boundary on the threshold itself", () => {
      const under = rollUpStates([city({ leads: LEAD_THRESHOLDS.worked - 1 })]);
      expect(under.get("WA")!.level).toBe("started");
      const under2 = rollUpStates([city({ leads: LEAD_THRESHOLDS.heavy - 1 })]);
      expect(under2.get("WA")!.level).toBe("worked");
    });

    it("sums across cities before deciding", () => {
      const rows = rollUpStates([
        city({ city: "Seattle", leads: 60 }),
        city({ city: "Tacoma", leads: 60 }),
      ]);
      expect(rows.get("WA")!.level).toBe("worked");
    });
  });

  describe("open for this trade", () => {
    // cityCoverage calls a city "open" when it has been worked for some other
    // trade and never for this one: totals present, scoped counts zero.
    it("flags a state worked only for another trade", () => {
      const rows = rollUpStates([city({ runs: 0, leads: 0, totalRuns: 4, totalLeads: 120 })]);
      expect(rows.get("WA")).toMatchObject({ level: "cold", openForTrade: true });
    });

    it("is not open once this trade has touched it", () => {
      const rows = rollUpStates([
        city({ city: "Seattle", runs: 0, leads: 0, totalRuns: 4, totalLeads: 120 }),
        city({ city: "Tacoma", runs: 1, leads: 30 }),
      ]);
      expect(rows.get("WA")).toMatchObject({ level: "started", openForTrade: false });
    });

    it("is not open when nothing has ever happened there", () => {
      const rows = rollUpStates([city()]);
      expect(rows.get("WA")!.openForTrade).toBe(false);
    });
  });

  it("normalises the state code and skips rows without one", () => {
    const rows = rollUpStates([
      city({ stateCode: "wa", leads: 5 }),
      city({ stateCode: " WA ", leads: 5 }),
      city({ stateCode: "", leads: 99 }),
    ]);
    expect([...rows.keys()]).toEqual(["WA"]);
    expect(rows.get("WA")!.leads).toBe(10);
  });
});
