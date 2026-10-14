import { describe, expect, it } from "vitest";
import { daysLeft, endLabel, formatContractDate, formatDollars, lengthLabel, termProgress } from "./contract";

const now = new Date(2026, 9, 6, 15, 30); // Oct 6, 2026, mid-afternoon local

describe("contract helpers", () => {
  it("formats dates and blanks", () => {
    expect(formatContractDate("2026-09-01")).toBe("Sep 1, 2026");
    expect(formatContractDate(null)).toBe("");
  });

  it("counts calendar days, ignoring the time of day", () => {
    expect(daysLeft("2026-10-07", now)).toBe(1);
    expect(daysLeft("2026-10-06", now)).toBe(0);
    expect(daysLeft("2026-10-01", now)).toBe(-5);
    expect(daysLeft(null, now)).toBeNull();
  });

  it("labels the end, flagging the last 30 days", () => {
    expect(endLabel("2027-03-01", now)).toEqual({ text: "Ends in 146 days", soon: false });
    expect(endLabel("2026-10-20", now)).toEqual({ text: "Ends in 14 days", soon: true });
    expect(endLabel("2026-10-07", now)).toEqual({ text: "Ends in 1 day", soon: true });
    expect(endLabel("2026-10-01", now)).toEqual({ text: "Ended", soon: true });
  });

  it("places today on the term", () => {
    expect(termProgress("2026-09-01", "2026-11-10", now)).toBeCloseTo(0.5, 5);
    expect(termProgress("2026-11-01", "2027-01-01", now)).toBe(0);
    expect(termProgress("2026-09-01", null, now)).toBeNull();
  });

  it("formats money and length", () => {
    expect(formatDollars(2000)).toBe("$2,000");
    expect(formatDollars(null)).toBe("");
    expect(lengthLabel(1)).toBe("1 month");
    expect(lengthLabel(6)).toBe("6 months");
  });
});
