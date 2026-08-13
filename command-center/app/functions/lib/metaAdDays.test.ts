import { describe, it, expect } from "vitest";
import {
  buildAdDayUpserts,
  toSpendRows,
  AD_DAY_COLUMNS,
  type MetaInsightRow,
} from "./metaAdDays";

const TENANT = "11111111-2222-3333-4444-555555555555";

// Shaped like a real /insights response at level=ad, time_increment=1.
function insight(over: Partial<MetaInsightRow> = {}): MetaInsightRow {
  return {
    date_start: "2026-03-21",
    date_stop: "2026-03-21",
    ad_id: "120212000001",
    ad_name: "Oak Removal Video",
    adset_id: "120211000001",
    adset_name: "Homeowners 35-65 15mi",
    campaign_id: "120210000001",
    campaign_name: "Tree Removal Leads",
    spend: "11.02",
    impressions: "1063",
    reach: "891",
    inline_link_clicks: "19",
    // Meta reports the roll-up alongside its components. 4 is the answer; 4 + 4
    // = 8 is what a naive sum returns. See lib/metaActions.ts.
    actions: [
      { action_type: "lead", value: "4" },
      { action_type: "offsite_conversion.fb_pixel_lead", value: "4" },
      { action_type: "video_view", value: "512" },
    ],
    ...over,
  };
}

describe("buildAdDayUpserts", () => {
  it("maps a Meta row onto the meta_ad_days columns", () => {
    const [row] = buildAdDayUpserts([insight()], TENANT);
    expect(row).toEqual({
      tenant_id: TENANT,
      date: "2026-03-21",
      ad_id: "120212000001",
      ad_name: "Oak Removal Video",
      adset_id: "120211000001",
      adset_name: "Homeowners 35-65 15mi",
      campaign_id: "120210000001",
      campaign_name: "Tree Removal Leads",
      spend: 11.02,
      impressions: 1063,
      reach: 891,
      link_clicks: 19,
      leads: 4,
    });
  });

  it("counts a conversion once, never the roll-up plus its components", () => {
    // The 26-vs-52 bug, at the row level. Storing the doubled figure would put
    // it in the database, where it would outlive the fix.
    const [row] = buildAdDayUpserts([insight()], TENANT);
    expect(row.leads).toBe(4);
  });

  it("records no leads for an ad Meta reported no conversions on", () => {
    // An ad with no conversions has no `actions` key at all, which must read as
    // zero rather than dropping the row: the spend on it still has to show up.
    const [row] = buildAdDayUpserts([insight({ actions: undefined })], TENANT);
    expect(row.leads).toBe(0);
    expect(row.spend).toBe(11.02);
  });

  it("ignores engagement actions that are not conversions", () => {
    const [row] = buildAdDayUpserts(
      [insight({ actions: [{ action_type: "video_view", value: "900" }] })],
      TENANT,
    );
    expect(row.leads).toBe(0);
  });

  it("takes the date from Meta's date_start, never the clock", () => {
    // This is the bug in the Make scenario: it stamped formatDate(now), the run
    // date. A late run, a retry, or a midnight timezone crossing filed spend
    // under the wrong day and skewed every date-ranged KPI.
    const [row] = buildAdDayUpserts([insight({ date_start: "2026-03-19" })], TENANT);
    expect(row.date).toBe("2026-03-19");
  });

  it("coerces Meta's numeric-as-string values", () => {
    const [row] = buildAdDayUpserts([insight({ spend: "0.00", impressions: "0" })], TENANT);
    expect(row.spend).toBe(0);
    expect(row.impressions).toBe(0);
  });

  it("defaults missing metrics to zero rather than null", () => {
    const [row] = buildAdDayUpserts(
      [insight({ reach: undefined, inline_link_clicks: undefined })],
      TENANT,
    );
    expect(row.reach).toBe(0);
    expect(row.link_clicks).toBe(0);
  });

  it("clamps a negative to zero", () => {
    const [row] = buildAdDayUpserts([insight({ spend: "-5" })], TENANT);
    expect(row.spend).toBe(0);
  });

  it("drops a row with no ad id or no usable date, which cannot be keyed", () => {
    const rows = buildAdDayUpserts(
      [insight({ ad_id: "" }), insight({ date_start: "" }), insight({ date_start: "not-a-date" })],
      TENANT,
    );
    expect(rows).toHaveLength(0);
  });

  it("drops a non-numeric metric row rather than writing NaN", () => {
    const rows = buildAdDayUpserts([insight({ spend: "n/a" })], TENANT);
    expect(rows).toHaveLength(0);
  });

  it("is idempotent: the same input twice yields identical rows", () => {
    const a = buildAdDayUpserts([insight()], TENANT);
    const b = buildAdDayUpserts([insight()], TENANT);
    expect(a).toEqual(b);
  });

  it("keeps one row per ad per day so the unique key never collides", () => {
    const rows = buildAdDayUpserts(
      [
        insight({ ad_id: "a", date_start: "2026-03-21" }),
        insight({ ad_id: "a", date_start: "2026-03-22" }),
        insight({ ad_id: "b", date_start: "2026-03-21" }),
      ],
      TENANT,
    );
    const keys = rows.map((r) => `${r.ad_id}|${r.date}`);
    expect(new Set(keys).size).toBe(3);
  });

  it("names every column the table has, so the select list cannot drift", () => {
    const [row] = buildAdDayUpserts([insight()], TENANT);
    for (const col of AD_DAY_COLUMNS.split(", ")) {
      if (col === "tenant_id") continue;
      expect(row).toHaveProperty(col);
    }
  });
});

describe("toSpendRows", () => {
  it("turns DB rows into the shape the metrics lib consumes", () => {
    const rows = toSpendRows([
      {
        date: "2026-03-21",
        ad_id: "a1",
        ad_name: "Ad One",
        adset_id: "s1",
        adset_name: "Set One",
        campaign_id: "c1",
        campaign_name: "Camp One",
        spend: "11.02", // PostgREST returns numeric as string
        impressions: 1063,
        reach: 891,
        link_clicks: 19,
        leads: 4,
      },
    ]);
    expect(rows[0]).toEqual({
      date: "2026-03-21",
      adId: "a1",
      adName: "Ad One",
      adsetId: "s1",
      adsetName: "Set One",
      campaignId: "c1",
      campaignName: "Camp One",
      spend: 11.02,
      impressions: 1063,
      reach: 891,
      linkClicks: 19,
      leads: 4,
    });
  });

  it("survives nulls in the name columns", () => {
    const rows = toSpendRows([
      { date: "2026-03-21", ad_id: "a1", ad_name: null, spend: null, impressions: null },
    ]);
    expect(rows[0].adName).toBe("");
    expect(rows[0].spend).toBe(0);
  });

  it("reads a pre-0108 row, written before the leads column existed, as zero", () => {
    const rows = toSpendRows([{ date: "2026-03-21", ad_id: "a1", spend: "5.00" }]);
    expect(rows[0].leads).toBe(0);
  });
});
