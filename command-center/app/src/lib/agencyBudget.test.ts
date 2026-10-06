import { describe, expect, it } from "vitest";
import {
  budgetTotal,
  categoryTotals,
  knownCategories,
  normalizeItems,
  parseAmount,
  previousItems,
  type BudgetItem,
} from "./agencyBudget";

const item = (name: string, category: string, amount: number): BudgetItem => ({
  id: name,
  name,
  category,
  amount,
});

describe("parseAmount", () => {
  it("reads typed money", () => {
    expect(parseAmount("$1,200.50")).toBe(1200.5);
    expect(parseAmount(" 297 ")).toBe(297);
    expect(parseAmount(19.999)).toBe(20);
  });
  it("reads junk as 0", () => {
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("abc")).toBe(0);
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount(Number.NaN)).toBe(0);
  });
});

describe("normalizeItems", () => {
  it("keeps good items and drops non-objects", () => {
    const out = normalizeItems([{ id: "a", name: " GHL ", category: "Software", amount: "297" }, 5, null]);
    expect(out).toEqual([{ id: "a", name: "GHL", category: "Software", amount: 297 }]);
  });
  it("gives an id to items without one", () => {
    expect(normalizeItems([{ name: "x", amount: 1 }])[0].id).toMatch(/\w+/);
  });
  it("returns [] for a non-array", () => {
    expect(normalizeItems({})).toEqual([]);
  });
});

describe("totals", () => {
  const items = [
    item("GHL", "Software", 297),
    item("Twilio", "Software", 120.1),
    item("Setter", "Payroll", 3200),
    item("Misc", "", 15),
  ];
  it("sums everything", () => {
    expect(budgetTotal(items)).toBe(3632.1);
  });
  it("splits by category, biggest first, blank as Other", () => {
    expect(categoryTotals(items)).toEqual([
      { category: "Payroll", total: 3200 },
      { category: "Software", total: 417.1 },
      { category: "Other", total: 15 },
    ]);
  });
});

describe("knownCategories", () => {
  it("puts starters first and dedupes case-insensitively", () => {
    const out = knownCategories([{ items: [item("a", "software", 1), item("b", "Rent", 1)] }]);
    expect(out[0]).toBe("Software");
    expect(out.filter((c) => c.toLowerCase() === "software")).toHaveLength(1);
    expect(out).toContain("Rent");
  });
});

describe("previousItems", () => {
  const rows = [
    { month: "2026-08-01", items: [item("old", "", 1)] },
    { month: "2026-09-01", items: [] },
    { month: "2026-10-01", items: [item("now", "", 1)] },
  ];
  it("finds the newest earlier month with items", () => {
    expect(previousItems(rows, "2026-11")?.[0].name).toBe("now");
    expect(previousItems(rows, "2026-10")?.[0].name).toBe("old");
  });
  it("is null when nothing came before", () => {
    expect(previousItems(rows, "2026-08")).toBeNull();
  });
});
