import { describe, expect, it } from "vitest";
import { groupMetaDaysByDate, reachIsExact, totalMetaDays } from "./metaDays";
import type { MetaDataRow } from "./api";

function ad(over: Partial<MetaDataRow> = {}): MetaDataRow {
  return {
    date: "2026-07-29",
    spend: 0,
    impressions: 0,
    reach: 0,
    linkClicks: 0,
    campaignName: "C",
    campaignId: "c1",
    adsetName: "S",
    adsetId: "s1",
    adName: "Ad",
    adId: "a1",
    ...over,
  };
}

// The real 29 July 2026 shape: three ads in one ad set, one taking almost all
// of the budget.
const JULY_29 = [
  ad({ adId: "a1", adName: "Video 2 | $100 OFF", spend: 16.23, impressions: 314, reach: 300, linkClicks: 9 }),
  ad({ adId: "a2", adName: "STATIC 4 | $100 OFF", spend: 0.33, impressions: 6, reach: 6, linkClicks: 0 }),
  ad({ adId: "a3", adName: "SIGN 1 | $100 OFF", spend: 1.26, impressions: 45, reach: 44, linkClicks: 1 }),
];

describe("groupMetaDaysByDate", () => {
  it("turns a day's ads into one row", () => {
    const [day] = groupMetaDaysByDate(JULY_29);
    expect(day.date).toBe("2026-07-29");
    expect(day.spend).toBeCloseTo(17.82, 2);
    expect(day.impressions).toBe(365);
    expect(day.linkClicks).toBe(10);
    expect(day.ads).toHaveLength(3);
  });

  it("keeps the ads, biggest spender first", () => {
    // The reason to open a day is to see what is taking the budget, so that ad
    // is the first thing read rather than something to hunt for.
    const [day] = groupMetaDaysByDate(JULY_29);
    expect(day.ads.map((a) => a.adId)).toEqual(["a1", "a3", "a2"]);
  });

  it("breaks a spend tie on the ad name, so the order does not wander", () => {
    const [day] = groupMetaDaysByDate([
      ad({ adId: "z", adName: "Zebra", spend: 5 }),
      ad({ adId: "a", adName: "Apple", spend: 5 }),
    ]);
    expect(day.ads.map((a) => a.adName)).toEqual(["Apple", "Zebra"]);
  });

  it("puts the newest day first", () => {
    const days = groupMetaDaysByDate([
      ad({ date: "2026-07-22" }),
      ad({ date: "2026-07-29" }),
      ad({ date: "2026-07-25" }),
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-07-29", "2026-07-25", "2026-07-22"]);
  });

  it("ignores a row with no date rather than inventing a bucket for it", () => {
    expect(groupMetaDaysByDate([ad({ date: "" }), ad({ date: "2026-07-29" })])).toHaveLength(1);
  });

  it("is empty for no rows", () => {
    expect(groupMetaDaysByDate([])).toEqual([]);
  });
});

describe("reach", () => {
  it("is exact only when a single ad ran that day", () => {
    // Reach is unique PEOPLE. Meta de-duplicates within one ad, but adding two
    // ads counts anybody who saw both of them twice, and the overlap cannot be
    // recovered from this data. A day with three ads reporting 350 reach did
    // not necessarily touch 350 people.
    const [three] = groupMetaDaysByDate(JULY_29);
    expect(three.reach).toBe(350);
    expect(reachIsExact(three)).toBe(false);

    const [one] = groupMetaDaysByDate([ad({ reach: 300 })]);
    expect(one.reach).toBe(300);
    expect(reachIsExact(one)).toBe(true);
  });

  it("treats spend, impressions and clicks as the plain counts they are", () => {
    // These are counts of events, not of people, so they add up correctly and
    // need no caveat. Only reach does.
    const [day] = groupMetaDaysByDate(JULY_29);
    expect(day.spend).toBeCloseTo(16.23 + 0.33 + 1.26, 2);
    expect(day.impressions).toBe(314 + 6 + 45);
    expect(day.linkClicks).toBe(9 + 0 + 1);
  });
});

describe("totalMetaDays", () => {
  it("adds the days on screen", () => {
    const days = groupMetaDaysByDate([
      ad({ date: "2026-07-29", spend: 10, impressions: 100, linkClicks: 2 }),
      ad({ date: "2026-07-28", spend: 5, impressions: 50, linkClicks: 1 }),
    ]);
    expect(totalMetaDays(days)).toEqual({
      spend: 15,
      impressions: 150,
      reach: 0,
      linkClicks: 3,
    });
  });

  it("is zeroed for no days, not NaN", () => {
    expect(totalMetaDays([])).toEqual({ spend: 0, impressions: 0, reach: 0, linkClicks: 0 });
  });
});
