import { describe, it, expect } from "vitest";
import {
  EMPTY_INPUTS,
  benchmark,
  computeMetrics,
  formatRatio,
  periodKey,
  type BusinessHealthInputs,
} from "./businessHealth";

// The month sample from the approved mockup, so the React port provably
// computes the same numbers the design was signed off on.
const SAMPLE: BusinessHealthInputs = {
  marketingSpend: 4250,
  newRevenue: 16150,
  newMrr: 6000,
  startClients: 3,
  newClients: 5,
  churnedClients: 2,
  profitMarginPct: 30,
  avgRetentionMonths: 7,
  avgRevenuePerClient: 2000,
  churnPct: 12,
};

describe("periodKey", () => {
  it("builds a month key", () => {
    expect(periodKey("month", new Date(2026, 6, 17))).toBe("2026-07");
  });

  it("builds a quarter key", () => {
    expect(periodKey("quarter", new Date(2026, 6, 17))).toBe("2026-Q3");
  });

  it("builds a year key", () => {
    expect(periodKey("year", new Date(2026, 6, 17))).toBe("2026");
  });

  it("pads single-digit months", () => {
    expect(periodKey("month", new Date(2026, 0, 5))).toBe("2026-01");
  });

  it("puts January in Q1 and December in Q4", () => {
    expect(periodKey("quarter", new Date(2026, 0, 1))).toBe("2026-Q1");
    expect(periodKey("quarter", new Date(2026, 11, 31))).toBe("2026-Q4");
  });

  it("puts each quarter boundary month in the right quarter", () => {
    expect(periodKey("quarter", new Date(2026, 2, 31))).toBe("2026-Q1"); // Mar
    expect(periodKey("quarter", new Date(2026, 3, 1))).toBe("2026-Q2"); // Apr
    expect(periodKey("quarter", new Date(2026, 5, 30))).toBe("2026-Q2"); // Jun
    expect(periodKey("quarter", new Date(2026, 8, 30))).toBe("2026-Q3"); // Sep
    expect(periodKey("quarter", new Date(2026, 9, 1))).toBe("2026-Q4"); // Oct
  });
});

describe("computeMetrics", () => {
  it("matches the mockup's month sample", () => {
    const c = computeMetrics(SAMPLE);
    expect(c.cac).toBe(850); // 4250 / 5
    expect(c.roas).toBeCloseTo(3.8, 5); // 16150 / 4250
    expect(c.avgLtv).toBe(4200); // 2000 * 7 * 0.30
    expect(c.ltvCac).toBeCloseTo(4.941, 3); // 4200 / 850
    expect(c.endClients).toBe(6); // 3 + 5 - 2
  });

  it("returns zeros for an untouched period instead of NaN", () => {
    const c = computeMetrics(EMPTY_INPUTS);
    expect(c).toEqual({ cac: 0, roas: 0, avgLtv: 0, ltvCac: 0, endClients: 0 });
  });

  it("guards CAC and LTV:CAC when no clients were signed", () => {
    const c = computeMetrics({ ...SAMPLE, newClients: 0 });
    expect(c.cac).toBe(0);
    expect(c.ltvCac).toBe(0);
  });

  it("guards ROAS when nothing was spent", () => {
    expect(computeMetrics({ ...SAMPLE, marketingSpend: 0 }).roas).toBe(0);
  });

  it("lets the roster shrink when churn outruns new business", () => {
    expect(computeMetrics({ ...SAMPLE, newClients: 1, churnedClients: 4 }).endClients).toBe(0);
    expect(computeMetrics({ ...SAMPLE, newClients: 0, churnedClients: 5 }).endClients).toBe(-2);
  });
});

describe("benchmark", () => {
  it("flips CAC at $1k", () => {
    expect(benchmark("cac", 999)).toEqual({ tone: "ok", label: "target <$1k" });
    expect(benchmark("cac", 1000)).toEqual({ tone: "bad", label: "over $1k" });
  });

  it("bands LTV:CAC at 1x and 3x", () => {
    expect(benchmark("ltvCac", 0.9).tone).toBe("bad");
    expect(benchmark("ltvCac", 1)).toEqual({ tone: "watch", label: "watch 1-3x" });
    expect(benchmark("ltvCac", 2.9).tone).toBe("watch");
    expect(benchmark("ltvCac", 3)).toEqual({ tone: "ok", label: "healthy >3x" });
  });

  it("bands ROAS at 1x and 3x", () => {
    expect(benchmark("roas", 0.9)).toEqual({ tone: "bad", label: "losing money" });
    expect(benchmark("roas", 1)).toEqual({ tone: "watch", label: "thin 1-3x" });
    expect(benchmark("roas", 3)).toEqual({ tone: "ok", label: "good >3x" });
  });

  it("bands churn at 8% and 15%", () => {
    expect(benchmark("churn", 7.9)).toEqual({ tone: "ok", label: "low <8%" });
    expect(benchmark("churn", 8)).toEqual({ tone: "watch", label: "watch" });
    expect(benchmark("churn", 15).tone).toBe("watch");
    expect(benchmark("churn", 15.1)).toEqual({ tone: "bad", label: "high >15%" });
  });

  it("bands margin at 10% and 25%", () => {
    expect(benchmark("margin", 9.9)).toEqual({ tone: "bad", label: "low" });
    expect(benchmark("margin", 10)).toEqual({ tone: "watch", label: "thin" });
    expect(benchmark("margin", 24.9).tone).toBe("watch");
    expect(benchmark("margin", 25)).toEqual({ tone: "ok", label: "healthy" });
  });
});

describe("formatRatio", () => {
  it("renders one decimal with an x suffix", () => {
    expect(formatRatio(4.9411)).toBe("4.9x");
    expect(formatRatio(0)).toBe("0.0x");
  });
});
