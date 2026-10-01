import { describe, expect, it } from "vitest";
import {
  SHEET_START,
  monthsBetween,
  sheetDailyEnd,
  sheetDays,
  sheetMonthLabel,
  sheetMonths,
  sheetPct,
} from "./coldSmsSheet";

describe("sheetDays", () => {
  it("labels days the way the sheet does: weekday letter and M/D/YY", () => {
    const days = sheetDays("2026-10-01", "2026-10-05");
    expect(days.map((d) => [d.dow, d.label])).toEqual([
      ["T", "10/1/26"],
      ["F", "10/2/26"],
      ["S", "10/3/26"],
      ["S", "10/4/26"],
      ["M", "10/5/26"],
    ]);
    expect(days[0].iso).toBe("2026-10-01");
    expect(days[0].month).toBe("2026-10");
  });

  it("runs across month and year boundaries without a gap", () => {
    const days = sheetDays("2026-12-30", "2027-01-02");
    expect(days.map((d) => d.iso)).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    expect(days[2].label).toBe("1/1/27");
  });
});

describe("sheetDailyEnd", () => {
  it("covers the sheet's 190 rows from the start at minimum", () => {
    expect(sheetDailyEnd("2026-10-01")).toBe("2027-04-08");
    expect(sheetDays(SHEET_START, sheetDailyEnd("2026-10-01"))).toHaveLength(190);
  });

  it("keeps a month of rows ahead of today once today passes that", () => {
    expect(sheetDailyEnd("2027-05-10")).toBe("2027-06-09");
  });
});

describe("monthsBetween", () => {
  it("lists every month touched, as YYYY-MM", () => {
    expect(monthsBetween("2026-11-15", "2027-02-01")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });
});

describe("sheetMonths", () => {
  it("gives the sheet's six month rows from October 2026", () => {
    expect(sheetMonths([], "2026-10-01")).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
    ]);
  });

  it("adds logged months and the current month, sorted, no repeats", () => {
    expect(sheetMonths(["2026-07-01", "2026-10-01"], "2027-05-03")).toEqual([
      "2026-07",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
    ]);
  });
});

describe("sheetMonthLabel", () => {
  it("names the month and year", () => {
    expect(sheetMonthLabel("2026-10")).toBe("October 2026");
    expect(sheetMonthLabel("2027-01-01")).toBe("January 2027");
  });
});

describe("sheetPct", () => {
  it("formats to two decimals like the sheet", () => {
    expect(sheetPct((24 / 500) * 100)).toBe("4.80%");
    expect(sheetPct((5 / 24) * 100)).toBe("20.83%");
  });

  it("is blank where the sheet would divide by zero", () => {
    expect(sheetPct(null)).toBe("");
  });
});
