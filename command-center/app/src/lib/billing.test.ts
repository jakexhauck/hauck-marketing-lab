import { describe, it, expect } from "vitest";
import {
  parseMoneyInput,
  formatMoney,
  billingDateHint,
  sanitizeBillingPatch,
  emptyBillingForm,
  type BillingForm,
} from "./billing";

describe("parseMoneyInput", () => {
  it("reads a thousands-separated amount", () => {
    expect(parseMoneyInput("2,000")).toBe(2000);
  });

  it("reads a plain amount", () => {
    expect(parseMoneyInput("750")).toBe(750);
  });

  it("keeps digits only, so a $ prefix and stray text drop out", () => {
    expect(parseMoneyInput("$1,500")).toBe(1500);
    expect(parseMoneyInput("1.5k")).toBe(15);
  });

  it("treats blank / garbage as zero", () => {
    expect(parseMoneyInput("")).toBe(0);
    expect(parseMoneyInput("   ")).toBe(0);
    expect(parseMoneyInput("abc")).toBe(0);
  });

  it("cannot produce a negative (the minus sign is not a digit)", () => {
    expect(parseMoneyInput("-500")).toBe(500);
  });
});

describe("formatMoney", () => {
  it("groups thousands", () => {
    expect(formatMoney(2000)).toBe("2,000");
    expect(formatMoney(1500000)).toBe("1,500,000");
  });

  it("renders zero and small amounts plainly", () => {
    expect(formatMoney(0)).toBe("0");
    expect(formatMoney(750)).toBe("750");
  });
});

describe("billingDateHint", () => {
  const now = new Date(2026, 6, 17); // Fri Jul 17 2026, local

  it("flags a billing date inside the 7 day window", () => {
    const hint = billingDateHint("Jul 22, 2026", now);
    expect(hint).toEqual({ days: 5, label: "IN 5 DAYS" });
  });

  it("singularizes one day", () => {
    expect(billingDateHint("Jul 18, 2026", now)?.label).toBe("IN 1 DAY");
  });

  it("labels today", () => {
    expect(billingDateHint("Jul 17, 2026", now)).toEqual({ days: 0, label: "TODAY" });
  });

  it("includes the far edge of the window and excludes past it", () => {
    expect(billingDateHint("Jul 24, 2026", now)?.days).toBe(7);
    expect(billingDateHint("Jul 25, 2026", now)).toBeNull();
  });

  it("ignores dates already gone", () => {
    expect(billingDateHint("Jul 16, 2026", now)).toBeNull();
  });

  it("accepts an ISO date", () => {
    expect(billingDateHint("2026-07-20", now)?.days).toBe(3);
  });

  it("returns null for blank or free text that is not a date", () => {
    expect(billingDateHint("", now)).toBeNull();
    expect(billingDateHint("   ", now)).toBeNull();
    expect(billingDateHint("Net 30", now)).toBeNull();
    expect(billingDateHint("whenever the owner pays", now)).toBeNull();
  });

  it("requires a 4 digit year, so a bare number is not a date", () => {
    expect(billingDateHint("3", now)).toBeNull();
    expect(billingDateHint("22", now)).toBeNull();
  });
});

describe("sanitizeBillingPatch", () => {
  const form: BillingForm = {
    ...emptyBillingForm(),
    source: "  Cold Call  ",
    dateClosed: "Jun 12, 2026",
    service: "Facebook ads + AI caller",
    paymentArrangement: "3k for 6 months",
    upfrontCash: "2,000",
    remainingCash: "1,000",
    totalCashCollected: "$2,000",
    status: "active",
    notes: "  Renewal call in Dec.  ",
  };

  it("coerces the cash fields to whole-dollar integers", () => {
    const patch = sanitizeBillingPatch(form);
    expect(patch.upfrontCash).toBe(2000);
    expect(patch.remainingCash).toBe(1000);
    expect(patch.totalCashCollected).toBe(2000);
  });

  it("trims the text fields", () => {
    const patch = sanitizeBillingPatch(form);
    expect(patch.source).toBe("Cold Call");
    expect(patch.notes).toBe("Renewal call in Dec.");
  });

  it("passes a valid status through", () => {
    expect(sanitizeBillingPatch(form).status).toBe("active");
    expect(sanitizeBillingPatch({ ...form, status: "churned" }).status).toBe("churned");
  });

  it("falls back to active for an unknown status", () => {
    const patch = sanitizeBillingPatch({
      ...form,
      status: "nonsense" as BillingForm["status"],
    });
    expect(patch.status).toBe("active");
  });

  it("keeps cleared fields as empty strings so a save wipes them", () => {
    const patch = sanitizeBillingPatch({ ...emptyBillingForm() });
    expect(patch.source).toBe("");
    expect(patch.churnDate).toBe("");
    expect(patch.upfrontCash).toBe(0);
  });
});
