import { describe, expect, it } from "vitest";
import {
  BUDGET_DEFAULTS,
  computeBudget,
  normalizeInputs,
  startingBudget,
} from "./coldSmsBudget";

describe("computeBudget", () => {
  it("prices Jake's plan: 500 a day, weekdays, one number, Low Volume A2P", () => {
    const b = computeBudget(BUDGET_DEFAULTS);
    expect(b.contactsTexted).toBe(11000);
    // 11,000 textable at 75% means 14,667 numbers checked.
    expect(b.lookups).toBe(14667);
    expect(b.segmentsOut).toBe(55000);
    expect(b.segmentsIn).toBeCloseTo(1100);
    expect(b.lines.lookup).toBeCloseTo(117.336);
    expect(b.lines.texts).toBeCloseTo(434.5);
    expect(b.lines.carrier).toBeCloseTo(220);
    expect(b.lines.replies).toBeCloseTo(8.69);
    expect(b.lines.numbers).toBeCloseTo(1.15);
    expect(b.lines.a2p).toBeCloseTo(1.5);
    expect(b.lines.other).toBe(0);
    expect(b.total).toBeCloseTo(783.176);
  });

  it("adds the one-time A2P fee and other monthly costs", () => {
    const b = computeBudget({ ...BUDGET_DEFAULTS, a2pOneTime: 22.5, otherMonthly: 50 });
    expect(b.lines.a2p).toBeCloseTo(24);
    expect(b.lines.other).toBe(50);
  });

  it("treats blank cells as zero and never divides by a zero textable rate", () => {
    const b = computeBudget({ ...BUDGET_DEFAULTS, contactsPerDay: null, textableRate: null });
    expect(b.contactsTexted).toBe(0);
    expect(b.lookups).toBe(0);
    // Fixed costs still count.
    expect(b.total).toBeCloseTo(2.65);
  });

  it("rounds lookups up to whole numbers", () => {
    const b = computeBudget({ ...BUDGET_DEFAULTS, contactsPerDay: 1, sendDays: 2 });
    expect(b.lookups).toBe(3);
  });
});

describe("normalizeInputs", () => {
  it("keeps known numeric keys, strips $ , %, and drops anything else", () => {
    const out = normalizeInputs({ contactsPerDay: "1,000", replyRate: "", junk: 4, phoneNumbers: "x", a2pMonthly: "$10" });
    expect(out.contactsPerDay).toBe(1000);
    expect(out.replyRate).toBeNull();
    expect(out.phoneNumbers).toBeNull();
    expect(out.a2pMonthly).toBe(10);
    expect("junk" in out).toBe(false);
  });
});

describe("startingBudget", () => {
  const rows = [
    { month: "2026-10-01", inputs: { ...BUDGET_DEFAULTS, contactsPerDay: 200, a2pOneTime: 22.5 } },
    { month: "2026-08-01", inputs: { ...BUDGET_DEFAULTS, contactsPerDay: 10 } },
  ];

  it("uses the month's own row when there is one", () => {
    expect(startingBudget(rows, "2026-10").a2pOneTime).toBe(22.5);
    expect(startingBudget(rows, "2026-08").contactsPerDay).toBe(10);
  });

  it("copies the latest earlier month, without its one-time A2P fee", () => {
    const s = startingBudget(rows, "2026-11");
    expect(s.contactsPerDay).toBe(200);
    expect(s.a2pOneTime).toBeNull();
  });

  it("falls back to the defaults with nothing earlier", () => {
    expect(startingBudget(rows, "2026-07")).toEqual(BUDGET_DEFAULTS);
  });
});
