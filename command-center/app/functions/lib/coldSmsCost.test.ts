import { describe, expect, it } from "vitest";
import { daysToCount, isFinal, priceTally, tallyMessages } from "./coldSmsCost";
import { BUDGET_DEFAULTS } from "../../src/lib/coldSmsBudget";

const NUM = "+13133517535";

describe("tallyMessages", () => {
  it("counts texts from the number and replies to it, with segments", () => {
    const long = "a".repeat(200); // 2 GSM segments
    const t = tallyMessages(
      [
        { direction: "outbound", from: NUM, status: "delivered", body: "hi" },
        { direction: "outbound", from: NUM, status: "undelivered", body: long },
        { direction: "outbound", from: NUM, status: "failed", body: "hi" },
        { direction: "outbound", from: "+10000000000", status: "delivered", body: "other number" },
        { direction: "inbound", to: NUM, status: "delivered", body: "who is this 😀" },
        { direction: "inbound", to: "+10000000000", status: "delivered", body: "not ours" },
      ],
      NUM,
    );
    expect(t).toEqual({ outCount: 2, outSegments: 3, inCount: 1, inSegments: 1 });
  });
});

describe("daysToCount", () => {
  it("stops at today", () => {
    expect(daysToCount("2026-10", "2026-10-03")).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  });
  it("covers a whole past month", () => {
    expect(daysToCount("2026-09", "2026-10-06")).toHaveLength(30);
  });
  it("is empty for a future month", () => {
    expect(daysToCount("2026-11", "2026-10-06")).toEqual([]);
  });
});

describe("isFinal", () => {
  it("is final once synced three days after the day ended", () => {
    expect(isFinal("2026-10-01", "2026-10-05T00:00:00Z")).toBe(true);
    expect(isFinal("2026-10-01", "2026-10-04T23:00:00Z")).toBe(false);
    expect(isFinal("2026-10-01", "2026-10-01T23:00:00Z")).toBe(false);
  });
});

describe("priceTally", () => {
  it("prices segments at the budget rates plus the flat fees", () => {
    const c = priceTally({ outCount: 100, outSegments: 100, inCount: 10, inSegments: 10 }, BUDGET_DEFAULTS);
    expect(c.texts).toBeCloseTo(100 * (0.0079 + 0.0045));
    expect(c.replies).toBeCloseTo(10 * (0.0079 + 0.007));
    expect(c.fixed).toBeCloseTo(1.15 + 1.5);
    expect(c.total).toBeCloseTo(c.texts + c.replies + c.fixed);
  });
});
