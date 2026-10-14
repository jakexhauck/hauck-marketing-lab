import { describe, expect, it } from "vitest";
import {
  computeScaling,
  formatScaling,
  DAYS_PER_MONTH,
  DEFAULT_INPUTS,
  type ScalingInputs,
} from "./scalingCalculator";

function inputs(overrides: Partial<ScalingInputs> = {}): ScalingInputs {
  return { ...DEFAULT_INPUTS, ...overrides };
}

describe("computeScaling", () => {
  it("matches the source sheet baseline on the default inputs", () => {
    const out = computeScaling(DEFAULT_INPUTS);

    expect(out.gap).toBe(10000);
    expect(out.newClientsNeeded).toBe(10);
    expect(out.callsShowsNeeded).toBe(50);
    expect(out.totalCallsNeeded).toBeCloseTo(83.333, 2);
    expect(out.totalMonthlyInput).toBeCloseTo(4166.667, 2);
    expect(out.totalDailyInput).toBeCloseTo(138.889, 2);

    expect(formatScaling(out.newClientsNeeded)).toBe("10");
    expect(formatScaling(out.callsShowsNeeded)).toBe("50");
    expect(formatScaling(out.totalCallsNeeded)).toBe("83");
    expect(formatScaling(out.totalMonthlyInput)).toBe("4,167");
    expect(formatScaling(out.totalDailyInput)).toBe("139");
  });

  it("keeps intermediates raw so the daily number does not drift", () => {
    // Rounding calls (83.33 -> 83) before dividing would yield 138, not 139.
    const out = computeScaling(DEFAULT_INPUTS);
    expect(formatScaling(out.totalDailyInput)).toBe("139");
    expect(formatScaling(out.totalDailyInput)).not.toBe("138");
  });

  it("subtracts current revenue from the goal", () => {
    const out = computeScaling(inputs({ currentRevenue: 4000 }));

    expect(out.gap).toBe(6000);
    expect(out.newClientsNeeded).toBe(6);
    expect(out.callsShowsNeeded).toBe(30);
    expect(out.totalCallsNeeded).toBeCloseTo(50, 6);
    expect(out.totalMonthlyInput).toBeCloseTo(2500, 6);
    expect(formatScaling(out.totalDailyInput)).toBe("83");
  });

  it("returns 0 rather than Infinity or NaN when avg cash / close is 0", () => {
    const out = computeScaling(inputs({ avgCashClose: 0 }));

    expect(out.newClientsNeeded).toBe(0);
    expect(out.callsShowsNeeded).toBe(0);
    expect(out.totalCallsNeeded).toBe(0);
    expect(out.totalMonthlyInput).toBe(0);
    expect(out.totalDailyInput).toBe(0);
  });

  it("returns 0 rather than Infinity or NaN when closing % is 0", () => {
    const out = computeScaling(inputs({ closingPct: 0 }));

    expect(out.newClientsNeeded).toBe(10);
    expect(out.callsShowsNeeded).toBe(0);
    expect(out.totalCallsNeeded).toBe(0);
    expect(out.totalMonthlyInput).toBe(0);
    expect(out.totalDailyInput).toBe(0);
  });

  it("returns 0 rather than Infinity or NaN when show rate % is 0", () => {
    const out = computeScaling(inputs({ showRatePct: 0 }));

    expect(out.callsShowsNeeded).toBe(50);
    expect(out.totalCallsNeeded).toBe(0);
    expect(out.totalMonthlyInput).toBe(0);
    expect(out.totalDailyInput).toBe(0);
  });

  it("returns 0 rather than Infinity or NaN when booking rate % is 0", () => {
    const out = computeScaling(inputs({ bookingRatePct: 0 }));

    expect(out.totalCallsNeeded).toBeCloseTo(83.333, 2);
    expect(out.totalMonthlyInput).toBe(0);
    expect(out.totalDailyInput).toBe(0);
  });

  it("zeroes every output once revenue is already past the goal", () => {
    const out = computeScaling(inputs({ currentRevenue: 20000, monthlyCashGoal: 10000 }));

    expect(out.gap).toBe(0);
    expect(out.newClientsNeeded).toBe(0);
    expect(out.callsShowsNeeded).toBe(0);
    expect(out.totalCallsNeeded).toBe(0);
    expect(out.totalMonthlyInput).toBe(0);
    expect(out.totalDailyInput).toBe(0);
  });

  it("divides the monthly input by a fixed 30-day month", () => {
    const out = computeScaling(DEFAULT_INPUTS);
    expect(DAYS_PER_MONTH).toBe(30);
    expect(out.totalDailyInput).toBeCloseTo(out.totalMonthlyInput / DAYS_PER_MONTH, 9);
  });

  it("ignores offer price in the derivation (stored for reference only)", () => {
    const base = computeScaling(DEFAULT_INPUTS);
    const other = computeScaling(inputs({ offerPrice: 7500 }));
    expect(other).toEqual(base);
  });
});

describe("formatScaling", () => {
  it("rounds and groups thousands", () => {
    expect(formatScaling(4166.67)).toBe("4,167");
    expect(formatScaling(138.4)).toBe("138");
    expect(formatScaling(138.5)).toBe("139");
    expect(formatScaling(0)).toBe("0");
    expect(formatScaling(1234567)).toBe("1,234,567");
  });
});
