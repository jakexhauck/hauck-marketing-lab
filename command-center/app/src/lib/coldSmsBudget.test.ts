import { describe, expect, it } from "vitest";
import {
  BUDGET_DEFAULTS,
  computeBudget,
  normalizeInputs,
  normalizeSubscriptions,
  startingBudget,
  type BudgetInputs,
} from "./coldSmsBudget";

const base: BudgetInputs = { ...BUDGET_DEFAULTS, leadsToCheck: 1000 };

describe("computeBudget", () => {
  it("works out every line from the defaults", () => {
    const b = computeBudget(base, []);
    // 1000 checked, 75% textable.
    expect(b.contactsTexted).toBe(750);
    expect(b.textsSent).toBe(3000);
    expect(b.segmentsOut).toBe(3750);
    // 5% of 750 reply, 2 segments each.
    expect(b.segmentsIn).toBeCloseTo(75);
    expect(b.lines.lookup).toBeCloseTo(8);
    expect(b.lines.outbound).toBeCloseTo(29.625);
    expect(b.lines.carrier).toBeCloseTo(15);
    expect(b.lines.inbound).toBeCloseTo(0.5925);
    expect(b.lines.numbers).toBeCloseTo(1.15);
    expect(b.lines.a2p).toBeCloseTo(10);
    expect(b.lines.subscriptions).toBe(0);
    expect(b.total).toBeCloseTo(64.3675);
    expect(b.perContact).toBeCloseTo(64.3675 / 750);
  });

  it("adds subscriptions and the one-time A2P fee", () => {
    const b = computeBudget({ ...base, a2pOneTime: 22.5 }, [
      { name: "GHL", amount: 97 },
      { name: "Blank", amount: null },
    ]);
    expect(b.lines.a2p).toBeCloseTo(32.5);
    expect(b.lines.subscriptions).toBe(97);
  });

  it("treats a blank cell as zero and leaves per-contact blank with nobody texted", () => {
    const b = computeBudget({ ...BUDGET_DEFAULTS }, []);
    expect(b.contactsTexted).toBe(0);
    expect(b.lines.lookup).toBe(0);
    expect(b.perContact).toBeNull();
    // Fixed costs still count.
    expect(b.total).toBeCloseTo(11.15);
  });

  it("rounds contacts texted down to whole people", () => {
    const b = computeBudget({ ...base, leadsToCheck: 3, textableRate: 50 }, []);
    expect(b.contactsTexted).toBe(1);
  });
});

describe("normalizeInputs", () => {
  it("keeps known numeric keys and drops anything else", () => {
    const out = normalizeInputs({ leadsToCheck: "500", replyRate: "", junk: 4, phoneNumbers: "x" });
    expect(out.leadsToCheck).toBe(500);
    expect(out.replyRate).toBeNull();
    expect(out.phoneNumbers).toBeNull();
    expect("junk" in out).toBe(false);
  });
});

describe("normalizeSubscriptions", () => {
  it("keeps name and amount, drops non-objects", () => {
    expect(normalizeSubscriptions([{ name: " GHL ", amount: "97" }, 5, null])).toEqual([
      { name: "GHL", amount: 97 },
    ]);
    expect(normalizeSubscriptions("nope")).toEqual([]);
  });
});

describe("startingBudget", () => {
  const rows = [
    { month: "2026-10-01", inputs: { ...base, leadsToCheck: 2000 }, subscriptions: [{ name: "GHL", amount: 97 }] },
    { month: "2026-08-01", inputs: { ...base, leadsToCheck: 10 }, subscriptions: [] },
  ];

  it("uses the month's own row when there is one", () => {
    const s = startingBudget(rows, "2026-08");
    expect(s.saved).toBe(true);
    expect(s.inputs.leadsToCheck).toBe(10);
  });

  it("copies the latest earlier month when the month is new", () => {
    const s = startingBudget(rows, "2026-11");
    expect(s.saved).toBe(false);
    expect(s.inputs.leadsToCheck).toBe(2000);
    expect(s.subscriptions).toEqual([{ name: "GHL", amount: 97 }]);
  });

  it("does not carry the one-time A2P fee into a new month", () => {
    const s = startingBudget(
      [{ month: "2026-10-01", inputs: { ...base, a2pOneTime: 22.5 }, subscriptions: [] }],
      "2026-11",
    );
    expect(s.inputs.a2pOneTime).toBeNull();
  });

  it("falls back to the defaults with nothing earlier", () => {
    const s = startingBudget(rows, "2026-07");
    expect(s.inputs).toEqual(BUDGET_DEFAULTS);
    expect(s.subscriptions).toEqual([]);
  });
});
