import { describe, it, expect } from "vitest";
import { buildCoverage, citiesOf } from "./cities";

// The Cities tab answers one question: have we done this city for this trade
// yet. It got both halves wrong. The list was lead_cities alone, which is the
// 999 biggest cities, and Jake scrapes wealthy suburbs, so Mercer Island,
// Issaquah, Los Gatos and Gig Harbor were scraped and then rendered nowhere. And
// the counts merged every trade, so a city done for garage doors looked
// identical to one done for garage doors AND windows.

const city = (rank: number, name: string, code: string, stateName: string) => ({
  rank,
  city: name,
  state_name: stateName,
  state_code: code,
  population: 100000,
  growth_pct: 1.5,
});

const run = (niche: string, cities: unknown, at: string) => ({
  niche_id: niche,
  cities,
  states: [],
  created_at: at,
});

const count = (c: string, s: string, niche: string, leads: number) => ({
  city_key: c,
  state_key: s,
  niche_id: niche,
  leads,
});

const find = (rows: ReturnType<typeof buildCoverage>, name: string, code: string) =>
  rows.find((r) => r.city.toLowerCase() === name.toLowerCase() && r.stateCode === code);

describe("cities that are not on the planning list", () => {
  it("shows a hand-typed suburb that lead_cities has never heard of", () => {
    const rows = buildCoverage(
      [city(1, "Seattle", "WA", "Washington")],
      [],
      [run("garage_doors", [{ city: "Mercer Island", state: "WA" }], "2026-08-21T00:00:00Z")],
      "",
    );

    const mercer = find(rows, "Mercer Island", "WA");
    expect(mercer).toBeDefined();
    expect(mercer!.runs).toBe(1);
    // No rank and no population: it was scraped, it is not on the 999.
    expect(mercer!.rank).toBeNull();
    expect(mercer!.population).toBeNull();
  });

  it("shows a city that only ever appeared in the leads, title-cased", () => {
    const rows = buildCoverage([], [count("gig harbor", "wa", "windows_doors", 4)], [], "");
    const gig = find(rows, "Gig Harbor", "WA");
    expect(gig).toBeDefined();
    expect(gig!.leads).toBe(4);
    expect(gig!.totalRuns).toBe(0);
  });

  it("never lists a city twice when it is both scraped and on the list", () => {
    const rows = buildCoverage(
      [city(1, "Kirkland", "WA", "Washington")],
      [count("kirkland", "wa", "garage_doors", 3)],
      [run("garage_doors", [{ city: "Kirkland", state: "WA" }], "2026-08-21T00:00:00Z")],
      "",
    );
    expect(rows.filter((r) => r.city === "Kirkland")).toHaveLength(1);
    expect(find(rows, "Kirkland", "WA")!.leads).toBe(3);
  });

  // The trailing state is how the wizard writes the query string itself.
  it("matches 'Novi MI' to Novi", () => {
    const rows = buildCoverage(
      [city(1, "Novi", "MI", "Michigan")],
      [],
      [run("hvac", [{ city: "Novi MI", state: "MI" }], "2026-07-31T00:00:00Z")],
      "",
    );
    expect(find(rows, "Novi", "MI")!.runs).toBe(1);
    expect(rows).toHaveLength(1);
  });
});

describe("the curated metro grid", () => {
  const metros = [
    { metro: "Sacramento", state: "CA", query_anchor: "Sacramento CA", suburbs: ["Granite Bay CA", "Folsom CA"] },
  ];

  // The wizard picks cities off this list now, so a wealthy suburb nobody has
  // scraped yet has to BE on it. Dropping the old suggest-the-suburbs mode
  // without this would have quietly narrowed what Jake can target.
  it("offers an affluent suburb that has never been scraped", () => {
    const rows = buildCoverage([], [], [], "", metros);
    const granite = find(rows, "Granite Bay", "CA")!;
    expect(granite).toBeDefined();
    expect(granite.totalRuns).toBe(0);
    expect(granite.rank).toBeNull();
  });

  it("does not duplicate a suburb that is already on the planning list", () => {
    const rows = buildCoverage([city(1, "Folsom", "CA", "California")], [], [], "", metros);
    expect(rows.filter((r) => r.city === "Folsom")).toHaveLength(1);
  });

  it("keeps the coverage a grid city has earned", () => {
    const rows = buildCoverage(
      [],
      [],
      [run("garage_doors", [{ city: "Folsom", state: "CA" }], "2026-08-21T00:00:00Z")],
      "",
      metros,
    );
    expect(find(rows, "Folsom", "CA")!.runs).toBe(1);
  });
});

describe("coverage is per trade", () => {
  const cities = [city(1, "Kirkland", "WA", "Washington"), city(2, "Los Gatos", "CA", "California")];
  const runs = [
    run("windows_doors", [{ city: "Kirkland", state: "WA" }], "2026-08-20T00:00:00Z"),
    run(
      "garage_doors",
      [{ city: "Kirkland", state: "WA" }, { city: "Los Gatos", state: "CA" }],
      "2026-08-21T00:00:00Z",
    ),
  ];

  it("lists every trade a city has been worked for", () => {
    const rows = buildCoverage(cities, [], runs, "");
    expect(find(rows, "Kirkland", "WA")!.niches).toEqual(["garage_doors", "windows_doors"]);
    expect(find(rows, "Los Gatos", "CA")!.niches).toEqual(["garage_doors"]);
  });

  it("scopes the counts to the trade asked for, and leaves the totals alone", () => {
    const rows = buildCoverage(cities, [], runs, "windows_doors");
    const gatos = find(rows, "Los Gatos", "CA")!;
    // Still open for windows, and the page must be able to say so.
    expect(gatos.runs).toBe(0);
    expect(gatos.totalRuns).toBe(1);
    expect(find(rows, "Kirkland", "WA")!.runs).toBe(1);
  });

  it("dates the last run of the trade asked for, not the last run of any trade", () => {
    const rows = buildCoverage(cities, [], runs, "windows_doors");
    expect(find(rows, "Kirkland", "WA")!.lastRunAt).toBe("2026-08-20T00:00:00Z");
    expect(find(rows, "Kirkland", "WA")!.totalRuns).toBe(2);
  });

  it("counts leads per trade", () => {
    const rows = buildCoverage(
      cities,
      [count("kirkland", "wa", "garage_doors", 9), count("kirkland", "wa", "windows_doors", 2)],
      [],
      "windows_doors",
    );
    const kirkland = find(rows, "Kirkland", "WA")!;
    expect(kirkland.leads).toBe(2);
    expect(kirkland.totalLeads).toBe(11);
  });
});

describe("state matching", () => {
  // Measured, not hypothetical: the live runs target Birmingham MICHIGAN, and a
  // name-only fallback handed that run to Birmingham ALABAMA.
  it("never credits a run to the same-named city in another state", () => {
    const rows = buildCoverage(
      [city(1, "Birmingham", "AL", "Alabama")],
      [],
      [run("hvac", [{ city: "Birmingham MI", state: "MI" }], "2026-07-31T00:00:00Z")],
      "",
    );
    expect(find(rows, "Birmingham", "AL")!.runs).toBe(0);
    expect(find(rows, "Birmingham", "MI")!.runs).toBe(1);
  });

  it("reads a full state name and a code as the same state", () => {
    const rows = buildCoverage(
      [city(1, "Novi", "MI", "Michigan")],
      [count("novi", "michigan", "hvac", 5), count("novi", "mi", "hvac", 3)],
      [],
      "",
    );
    expect(find(rows, "Novi", "MI")!.leads).toBe(8);
    expect(rows).toHaveLength(1);
  });

  // Older runs stored a bare string with no state at all.
  it("credits a stateless entry to the city of that name", () => {
    const rows = buildCoverage(
      [city(1, "Boise", "ID", "Idaho")],
      [],
      [run("home_services", ["Boise"], "2026-07-30T00:00:00Z")],
      "",
    );
    expect(find(rows, "Boise", "ID")!.runs).toBe(1);
    expect(rows).toHaveLength(1);
  });
});

describe("reading a run's city list", () => {
  it("splits an entry that names two cities on one line", () => {
    expect(citiesOf([{ city: "Frisco / Southlake", state: "TX" }])).toEqual([
      { city: "Frisco", state: "TX" },
      { city: "Southlake", state: "TX" },
    ]);
  });

  it("ignores anything that is not a city", () => {
    expect(citiesOf([null, 42, {}, { city: "   " }, ""])).toEqual([]);
    expect(citiesOf("Plano")).toEqual([]);
  });
});
