import { describe, expect, it } from "vitest";
import { ROI_DEFAULTS, averageProfit, roiRows } from "./roiCalculator";

describe("roiCalculator", () => {
  it("average profit is job size times margin", () => {
    expect(averageProfit(ROI_DEFAULTS)).toBe(3750);
  });

  it("matches the sheet's funnel, profit and ROI at its defaults", () => {
    const [best, avg, worst] = roiRows(ROI_DEFAULTS);
    expect([best.leads, best.appointments, best.clients, best.profit, best.roi]).toEqual([75, 15, 11, 41250, 27.5]);
    expect([avg.leads, avg.appointments, avg.clients, avg.profit, avg.roi]).toEqual([50, 8, 5, 18750, 12.5]);
    expect([worst.leads, worst.appointments, worst.clients, worst.profit, worst.roi]).toEqual([30, 5, 3, 11250, 7.5]);
  });

  it("revenue uses whole clients signed", () => {
    const [best, avg, worst] = roiRows(ROI_DEFAULTS);
    expect([best.revenue, avg.revenue, worst.revenue]).toEqual([165000, 75000, 45000]);
  });

  it("has no ROI with zero spend", () => {
    expect(roiRows({ ...ROI_DEFAULTS, adSpend: 0 })[0].roi).toBeNull();
  });
});
