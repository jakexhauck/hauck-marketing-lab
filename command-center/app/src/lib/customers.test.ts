import { describe, it, expect } from "vitest";
import { applySchedule, DEMO_CUSTOMERS, DEMO_RECURRENCE, type Customer } from "./customers";

const base: Customer = {
  id: "c1", name: "Aaron Webb", business: "Ferndale Cafe", phone: "(248) 555-0121",
  email: "a@x.com", city: "Ferndale", lifetimeValue: 2880, jobCount: 12,
  lastJobAt: "2026-06-08", jobs: [],
};

describe("applySchedule", () => {
  it("no rule -> one-time, null nextVisit", () => {
    const r = applySchedule(base, null, { todayIso: "2026-07-01" });
    expect(r.segment).toBe("onetime");
    expect(r.nextVisit).toBeNull();
  });
  it("with rule -> recurring, computes nextVisit", () => {
    const r = applySchedule(base,
      { cadenceWeeks: 2, weekday: 2, anchorDate: "2026-07-07" },
      { service: "Storefront", priceCents: 24000, todayIso: "2026-07-01" });
    expect(r.segment).toBe("recurring");
    expect(r.nextVisit).toBe("2026-07-07");
    expect(r.service).toBe("Storefront");
  });
});

describe("demo data", () => {
  it("every recurrence key maps to a real customer id", () => {
    const ids = new Set(DEMO_CUSTOMERS.map((c) => c.id));
    for (const id of Object.keys(DEMO_RECURRENCE)) expect(ids.has(id)).toBe(true);
  });
  it("has both recurring and one-time customers", () => {
    expect(DEMO_CUSTOMERS.length).toBeGreaterThan(Object.keys(DEMO_RECURRENCE).length);
  });
});
