import { describe, it, expect } from "vitest";
import { columnLabel, DEMO_CUSTOMERS } from "./customers";

describe("columnLabel", () => {
  it("strips a keycap emoji whole, digit included", () => {
    // "1️⃣" is U+0031 U+FE0F U+20E3: an ASCII digit plus two invisible
    // modifiers. Removing only the modifiers strands the "1" and the column
    // reads "One-Time 1".
    expect(columnLabel("One-Time Customer 1️⃣")).toBe("One-Time");
  });

  it("strips a pictographic emoji", () => {
    expect(columnLabel("Recurring Customer 🔁")).toBe("Recurring");
  });

  it("drops the redundant Customer noun", () => {
    // The page is already titled Customers and the column already holds them.
    expect(columnLabel("VIP Customers ⭐")).toBe("VIP");
  });

  it("keeps a stage name that is only a noun, rather than blanking the column", () => {
    expect(columnLabel("Customers")).toBe("Customers");
    expect(columnLabel("Customer 🔁")).toBe("Customer 🔁");
  });

  it("leaves an ordinary stage name alone", () => {
    expect(columnLabel("Recurring")).toBe("Recurring");
  });

  it("keeps digits that are part of the name", () => {
    expect(columnLabel("Tier 2 Customer")).toBe("Tier 2");
  });
});

describe("DEMO_CUSTOMERS", () => {
  it("leads with the recurring column, matching what the server returns", () => {
    expect(DEMO_CUSTOMERS.columns.map((c) => c.recurring)).toEqual([true, false]);
  });

  it("has every column's count and total agreeing with its own rows", () => {
    for (const col of DEMO_CUSTOMERS.columns) {
      expect(col.count).toBe(col.customers.length);
      expect(col.totalCents).toBe(
        col.customers.reduce((sum, c) => sum + c.totalCents, 0),
      );
    }
  });
});
