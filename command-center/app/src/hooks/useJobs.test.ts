import { describe, it, expect } from "vitest";
import { recurringJobs } from "./useJobs";
import { DEMO_CUSTOMERS } from "../lib/customers";

describe("recurringJobs", () => {
  it("generates booked jobs for an active recurrence in the window", () => {
    const c = DEMO_CUSTOMERS[0];
    const jobs = recurringJobs([c], {
      [c.id]: { contactId: c.id, cadenceWeeks: 2, weekday: 2,
        anchorDate: "2026-07-07", visitTime: "9:00 AM",
        service: "Storefront", priceCents: 24000, active: true },
    }, "2026-07-01", "2026-08-05");
    expect(jobs.length).toBe(3);
    expect(jobs[0]).toMatchObject({ status: "booked", customer: c.name, amount: 240 });
    expect(jobs[0].id.startsWith("rec:")).toBe(true);
  });
  it("skips inactive recurrences", () => {
    const c = DEMO_CUSTOMERS[0];
    const jobs = recurringJobs([c], {
      [c.id]: { contactId: c.id, cadenceWeeks: 1, weekday: 2,
        anchorDate: "2026-07-07", visitTime: null, service: null,
        priceCents: null, active: false },
    }, "2026-07-01", "2026-08-05");
    expect(jobs).toEqual([]);
  });
});
