import { describe, it, expect } from "vitest";
import {
  AD_TRACKING_COLUMNS,
  AD_TRACKING_GROUPS,
  AD_TRACKING_INPUT_KEYS,
  SUMMARY_CHIPS,
  computeAdTrackingRatios,
  computeRowCells,
  emptyAdTrackingInputs,
  formatMetric,
  buildTrackerRollup,
  rollupWindow,
  sumInputs,
  windowIsoDates,
  type AdTrackingInputs,
} from "./adTrackingMetrics";

// The mockup's July 6 seed row, the reference case in the plan.
const JUL6: AdTrackingInputs = {
  spend: 100,
  impressions: 9200,
  clicks: 158,
  linkClicks: 121,
  newLeads: 7,
  demosBooked: 3,
  qualified: 2,
  disqualified: 1,
  noShow: 0,
  sales: 1,
  contractedRev: 1200,
  ufCash: 600,
  newMrr: 0,
};

describe("column schema", () => {
  it("has 26 columns across the four bands", () => {
    expect(AD_TRACKING_COLUMNS).toHaveLength(26);
    const counts = AD_TRACKING_GROUPS.map(
      (g) => AD_TRACKING_COLUMNS.filter((c) => c.group === g.id).length,
    );
    expect(counts).toEqual([9, 5, 5, 7]);
  });

  it("keeps the bands contiguous and in order", () => {
    const order = AD_TRACKING_GROUPS.map((g) => g.id);
    const seen = AD_TRACKING_COLUMNS.map((c) => c.group).filter(
      (g, i, all) => g !== all[i - 1],
    );
    expect(seen).toEqual(order);
  });

  it("stores 13 inputs and derives the other 13", () => {
    expect(AD_TRACKING_INPUT_KEYS).toHaveLength(13);
    expect(AD_TRACKING_COLUMNS.filter((c) => !c.input)).toHaveLength(13);
  });

  it("has no duplicate column keys", () => {
    const keys = AD_TRACKING_COLUMNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("computeAdTrackingRatios", () => {
  it("matches the mockup formulas on the July 6 row", () => {
    const m = computeAdTrackingRatios(JUL6);
    expect(m.cpm).toBeCloseTo(10.87, 2);
    expect(m.cpc).toBeCloseTo(0.63, 2);
    expect(m.ctr).toBeCloseTo(1.72, 2);
    expect(m.cpl).toBeCloseTo(0.83, 2);
    expect(m.cpnl).toBeCloseTo(14.29, 2);
    expect(m.lpConv).toBeCloseTo(5.79, 2);
    expect(m.costDemo).toBeCloseTo(33.33, 2);
    expect(m.leadBook).toBeCloseTo(42.86, 2);
    expect(m.qualPct).toBeCloseTo(66.67, 2);
    expect(m.costQual).toBeCloseTo(50, 2);
    expect(m.cpa).toBeCloseTo(100, 2);
    expect(m.revRoas).toBeCloseTo(12, 2);
    expect(m.ufRoas).toBeCloseTo(6, 2);
  });

  it("returns null for every ratio when the row is empty, never NaN or Infinity", () => {
    const m = computeAdTrackingRatios(emptyAdTrackingInputs());
    for (const [key, value] of Object.entries(m)) {
      expect(value, key).toBeNull();
    }
  });

  it("nulls only the ratios whose own denominator is zero", () => {
    // Spend and impressions logged, nothing downstream yet.
    const m = computeAdTrackingRatios({
      ...emptyAdTrackingInputs(),
      spend: 100,
      impressions: 9200,
    });
    expect(m.cpm).toBeCloseTo(10.87, 2);
    expect(m.cpc).toBeNull(); // no clicks
    expect(m.cpa).toBeNull(); // no sales
    expect(m.revRoas).toBe(0); // spend > 0, revenue 0 -> a real zero, not unknown
  });
});

describe("formatMetric", () => {
  it("renders each token", () => {
    expect(formatMetric("$", 1234.6)).toBe("$1,235");
    expect(formatMetric("$$", 0.6329)).toBe("$0.63");
    expect(formatMetric("#", 9200)).toBe("9,200");
    expect(formatMetric("%", 1.7174)).toBe("1.7%");
    expect(formatMetric("x", 12)).toBe("12.00x");
  });

  it("renders an unknown value as the app's empty glyph", () => {
    expect(formatMetric("$", null)).toBe("-");
    expect(formatMetric("%", null)).toBe("-");
    expect(formatMetric("x", null)).toBe("-");
  });
});

describe("computeRowCells", () => {
  it("formats the derived cells from typed strings", () => {
    const cells = computeRowCells({
      spend: "100",
      impressions: "9200",
      clicks: "158",
      linkClicks: "121",
      newLeads: "7",
      demosBooked: "3",
      qualified: "2",
      sales: "1",
      contractedRev: "1200",
      ufCash: "600",
    });
    expect(cells.cpm).toBe("$10.87");
    expect(cells.ctr).toBe("1.7%");
    expect(cells.revRoas).toBe("12.00x");
  });

  it("shows the empty glyph for a blank row", () => {
    const cells = computeRowCells({});
    expect(cells.cpm).toBe("-");
    expect(cells.cpa).toBe("-");
  });

  it("tolerates half-typed and junk values without producing NaN", () => {
    const cells = computeRowCells({ spend: "1.", impressions: "abc", clicks: "" });
    expect(cells.cpm).toBe("-");
    expect(Object.values(cells).some((v) => v.includes("NaN"))).toBe(false);
  });
});

describe("sumInputs", () => {
  it("sums the inputs and counts only days with something logged", () => {
    const { sums, filledDays } = sumInputs([
      { spend: "100", newLeads: "7" },
      { spend: "50", newLeads: "3" },
      {}, // untouched day
      { spend: "", newLeads: "" }, // typed then cleared, still empty
    ]);
    expect(sums.spend).toBe(150);
    expect(sums.newLeads).toBe(10);
    expect(filledDays).toBe(2);
  });

  it("counts a day logged even when the only value is a zero", () => {
    const { filledDays } = sumInputs([{ sales: "0" }]);
    expect(filledDays).toBe(1);
  });

  it("returns zeroed sums for no rows", () => {
    const { sums, filledDays } = sumInputs([]);
    expect(sums.spend).toBe(0);
    expect(filledDays).toBe(0);
  });
});

describe("windowIsoDates", () => {
  const cursor = { year: 2026, month: 6 }; // July 2026
  const today = { year: 2026, month: 6, day: 17 };

  it("MTD runs from the 1st to today", () => {
    const days = windowIsoDates(cursor, "mtd", today);
    expect(days[0]).toBe("2026-07-01");
    expect(days).toHaveLength(17);
    expect(days[days.length - 1]).toBe("2026-07-17");
  });

  it("a 7 day window ends on today and includes it", () => {
    const days = windowIsoDates(cursor, 7, today);
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-07-11");
    expect(days[days.length - 1]).toBe("2026-07-17");
  });

  it("clamps a window that would run before the 1st", () => {
    const days = windowIsoDates(cursor, 30, { year: 2026, month: 6, day: 3 });
    expect(days).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
  });

  it("ends a past month on its last day, not on today", () => {
    const days = windowIsoDates({ year: 2026, month: 5 }, 4, today); // June
    expect(days).toEqual(["2026-06-27", "2026-06-28", "2026-06-29", "2026-06-30"]);
  });

  it("covers a whole past month for MTD", () => {
    expect(windowIsoDates({ year: 2026, month: 1 }, "mtd", today)).toHaveLength(28);
  });

  it("handles a null today by running to the end of the month", () => {
    expect(windowIsoDates(cursor, "mtd", null)).toHaveLength(31);
  });
});

describe("rollupWindow", () => {
  const rows = {
    "2026-07-15": { spend: "100", contractedRev: "0", sales: "0" },
    "2026-07-16": { spend: "100", contractedRev: "400", sales: "1" },
    "2026-07-17": { spend: "200", contractedRev: "200", sales: "1" },
  };

  it("computes ratios from summed inputs, not the average of daily ratios", () => {
    const { sums, ratios } = rollupWindow(rows, [
      "2026-07-15",
      "2026-07-16",
      "2026-07-17",
    ]);
    expect(sums.spend).toBe(400);
    expect(sums.contractedRev).toBe(600);
    // Ratio of sums: 600/400 = 1.50. Average of daily ROAS (0, 4, 1) would be
    // 1.67, so this asserts the two genuinely differ.
    expect(ratios.revRoas).toBeCloseTo(1.5, 4);
    expect(ratios.cpa).toBeCloseTo(200, 4);
  });

  it("ignores days outside the window", () => {
    const { sums } = rollupWindow(rows, ["2026-07-17"]);
    expect(sums.spend).toBe(200);
  });

  it("yields zero sums and null ratios for an empty window", () => {
    const { sums, ratios, filledDays } = rollupWindow(rows, ["2026-07-01"]);
    expect(sums.spend).toBe(0);
    expect(filledDays).toBe(0);
    expect(ratios.revRoas).toBeNull();
  });
});

describe("buildTrackerRollup", () => {
  it("totals the inputs and averages them over logged days", () => {
    const { sums, filledDays } = sumInputs([
      { spend: "100", newLeads: "6" },
      { spend: "200", newLeads: "4" },
    ]);
    const { average, total } = buildTrackerRollup(sums, filledDays);
    expect(total.spend).toBe("$300");
    expect(total.newLeads).toBe("10");
    expect(average.spend).toBe("$150");
    expect(average.newLeads).toBe("5");
  });

  it("carries the window ratios on both rows (a ratio of sums is its own average)", () => {
    const { sums, filledDays } = sumInputs([
      { spend: "100", contractedRev: "400" },
      { spend: "300", contractedRev: "200" },
    ]);
    const { average, total } = buildTrackerRollup(sums, filledDays);
    expect(total.revRoas).toBe("1.50x");
    expect(average.revRoas).toBe("1.50x");
  });

  it("shows the empty glyph rather than dividing by zero logged days", () => {
    const { sums, filledDays } = sumInputs([]);
    const { average, total } = buildTrackerRollup(sums, filledDays);
    expect(average.spend).toBe("-");
    expect(total.spend).toBe("$0");
    expect(total.revRoas).toBe("-");
  });
});

describe("SUMMARY_CHIPS", () => {
  it("exposes the eight strip chips", () => {
    expect(SUMMARY_CHIPS).toHaveLength(8);
    expect(SUMMARY_CHIPS.map((c) => c.key)).toEqual([
      "spend",
      "newLeads",
      "cpnl",
      "demosBooked",
      "qualified",
      "sales",
      "cpa",
      "revRoas",
    ]);
  });

  it("reads its value from the window sums and ratios", () => {
    const { sums, ratios } = rollupWindow(
      { "2026-07-17": { spend: "100", newLeads: "5", sales: "1", contractedRev: "300" } },
      ["2026-07-17"],
    );
    const byKey = Object.fromEntries(
      SUMMARY_CHIPS.map((c) => [c.key, formatMetric(c.format, c.get(sums, ratios))]),
    );
    expect(byKey.spend).toBe("$100");
    expect(byKey.newLeads).toBe("5");
    expect(byKey.cpnl).toBe("$20.00");
    expect(byKey.revRoas).toBe("3.00x");
    expect(byKey.cpa).toBe("$100");
  });
});
