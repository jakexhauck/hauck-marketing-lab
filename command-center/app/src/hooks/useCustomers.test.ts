// command-center/app/src/hooks/useCustomers.test.ts
import { describe, it, expect } from "vitest";
import { buildCustomers } from "./useCustomers";
import { DEMO_CUSTOMERS } from "../lib/customers";

describe("buildCustomers", () => {
  it("marks a customer with an active recurrence as recurring", () => {
    const id = DEMO_CUSTOMERS[0].id;
    const out = buildCustomers(DEMO_CUSTOMERS, {
      [id]: { contactId: id, cadenceWeeks: 1, weekday: 1, anchorDate: "2026-07-06",
        visitTime: null, service: "X", priceCents: 12000, active: true },
    }, "2026-07-01");
    const c = out.find((x) => x.id === id)!;
    expect(c.segment).toBe("recurring");
    expect(c.nextVisit).not.toBeNull();
  });
  it("no recurrence -> one-time", () => {
    const out = buildCustomers(DEMO_CUSTOMERS, {}, "2026-07-01");
    expect(out.every((c) => c.segment === "onetime")).toBe(true);
  });
});
