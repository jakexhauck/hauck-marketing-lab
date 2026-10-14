import { describe, expect, it } from "vitest";
import {
  budgetTotal,
  categoryTotals,
  knownCategories,
  normalizeItems,
  parseAmount,
  previousItems,
  normalizeRecurring,
  isActiveIn,
  removeRecurring,
  stepMonth,
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

describe("recurring", () => {
  const r = (id: string, start: string, end: string | null = null) => ({
    id,
    name: id,
    category: "Software",
    amount: 10,
    start,
    end,
  });

  it("normalizes and drops rows without a start month", () => {
    const out = normalizeRecurring([
      { id: "a", name: "GHL", amount: "297", start: "2026-10", end: null },
      { id: "b", name: "x", amount: 1 },
      { id: "c", name: "y", amount: 1, start: "2026-09-01", end: "bad" },
    ]);
    expect(out.map((i) => [i.id, i.amount, i.start, i.end])).toEqual([
      ["a", 297, "2026-10", null],
      ["c", 1, "2026-09", null],
    ]);
  });

  it("is active from start through end", () => {
    const i = r("a", "2026-09", "2026-11");
    expect(isActiveIn(i, "2026-08")).toBe(false);
    expect(isActiveIn(i, "2026-09")).toBe(true);
    expect(isActiveIn(i, "2026-11")).toBe(true);
    expect(isActiveIn(i, "2026-12")).toBe(false);
    expect(isActiveIn(r("b", "2026-09"), "2030-01")).toBe(true);
  });

  it("ends a row the month before when removed later, drops it in its first month", () => {
    const items = [r("a", "2026-08"), r("b", "2026-10")];
    expect(removeRecurring(items, "a", "2026-10")).toEqual([{ ...items[0], end: "2026-09" }, items[1]]);
    expect(removeRecurring(items, "b", "2026-10")).toEqual([items[0]]);
  });

  it("steps months across a year", () => {
    expect(stepMonth("2026-01", -1)).toBe("2025-12");
    expect(stepMonth("2026-12", 1)).toBe("2027-01");
  });
});
