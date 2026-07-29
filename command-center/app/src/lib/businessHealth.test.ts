import { describe, it, expect } from "vitest";
import {
  periodKey,
  computeMetrics,
  benchmark,
  ZERO_INPUTS,
  type BusinessHealthInputs,
} from "./businessHealth";

describe("periodKey", () => {
  it("month zero-pads the month", () => {
    expect(periodKey("month", new Date(2026, 6, 17))).toBe("2026-07"); // July
  });
  it("quarter maps month to Q1-Q4", () => {
    expect(periodKey("quarter", new Date(2026, 6, 17))).toBe("2026-Q3"); // July -> Q3
    expect(periodKey("quarter", new Date(2026, 0, 1))).toBe("2026-Q1"); // Jan -> Q1
    expect(periodKey("quarter", new Date(2026, 2, 31))).toBe("2026-Q1"); // Mar -> Q1
    expect(periodKey("quarter", new Date(2026, 3, 1))).toBe("2026-Q2"); // Apr -> Q2
    expect(periodKey("quarter", new Date(2026, 11, 31))).toBe("2026-Q4"); // Dec -> Q4
  });
  it("year is the plain year", () => {
    expect(periodKey("year", new Date(2026, 6, 17))).toBe("2026");
  });
});

describe("computeMetrics", () => {
  // The approved mockup's month sample.
  const sample: BusinessHealthInputs = {
    ...ZERO_INPUTS,
    marketingSpend: 4250,
    newRevenue: 16150,
    avgRevenuePerClient: 2000,
    avgRetentionMonths: 7,
    profitMarginPct: 30,
    newClients: 5,
    startClients: 3,
    churnedClients: 2,
  };

  it("matches the mockup sample", () => {
    const c = computeMetrics(sample);
    expect(c.cac).toBe(850); // 4250 / 5
    expect(c.roas).toBeCloseTo(3.8, 5); // 16150 / 4250
    expect(c.avgLtv).toBe(4200); // 2000 * 7 * 0.30
    expect(c.ltvCac).toBeCloseTo(4.941, 3); // 4200 / 850
    expect(c.endClients).toBe(6); // 3 + 5 - 2
  });

  it("guards divide-by-zero", () => {
    const noClients = computeMetrics({ ...sample, newClients: 0 });
    expect(noClients.cac).toBe(0);
    expect(noClients.ltvCac).toBe(0); // cac 0 -> ratio 0, not Infinity

    const noSpend = computeMetrics({ ...sample, marketingSpend: 0 });
    expect(noSpend.roas).toBe(0);
  });

  it("all-zero inputs produce all-zero metrics", () => {
    const c = computeMetrics(ZERO_INPUTS);
    expect(c).toEqual({ cac: 0, roas: 0, avgLtv: 0, ltvCac: 0, endClients: 0 });
  });
});

describe("benchmark", () => {
  it("cac at the $1k boundary", () => {
    expect(benchmark("cac", 999)).toEqual({ tone: "ok", label: "target <$1k" });
    expect(benchmark("cac", 1000)).toEqual({ tone: "bad", label: "over $1k" });
  });
  it("ltvCac across 1x and 3x", () => {
    expect(benchmark("ltvCac", 0.9).tone).toBe("bad");
    expect(benchmark("ltvCac", 1).tone).toBe("watch");
    expect(benchmark("ltvCac", 2.9).tone).toBe("watch");
    expect(benchmark("ltvCac", 3)).toEqual({ tone: "ok", label: "healthy >3x" });
  });
  it("roas across 1x and 3x", () => {
    expect(benchmark("roas", 0.9).tone).toBe("bad");
    expect(benchmark("roas", 1).tone).toBe("watch");
    expect(benchmark("roas", 3)).toEqual({ tone: "ok", label: "good >3x" });
  });
  it("churn across 8 and 15", () => {
    expect(benchmark("churn", 7.9)).toEqual({ tone: "ok", label: "low <8%" });
    expect(benchmark("churn", 8).tone).toBe("watch");
    expect(benchmark("churn", 15).tone).toBe("watch");
    expect(benchmark("churn", 15.1)).toEqual({ tone: "bad", label: "high >15%" });
  });
  it("margin across 10 and 25", () => {
    expect(benchmark("margin", 9.9)).toEqual({ tone: "bad", label: "low" });
    expect(benchmark("margin", 10).tone).toBe("watch");
    expect(benchmark("margin", 24.9).tone).toBe("watch");
    expect(benchmark("margin", 25)).toEqual({ tone: "ok", label: "healthy" });
  });
});
