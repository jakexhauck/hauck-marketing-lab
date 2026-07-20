import { describe, it, expect } from "vitest";
import { rollUpByContact, computeRates } from "./setterMetrics";

const dial = (contact: string, at: string, spoke: boolean, outcome: string) =>
  ({ contact_id: contact, dialed_at: at, spoke, outcome });

describe("rollUpByContact", () => {
  it("counts attempts and takes the earliest dial as first call", () => {
    const r = rollUpByContact([
      dial("c1", "2026-07-20T14:00:00Z", false, "no_answer"),
      dial("c1", "2026-07-20T09:00:00Z", false, "no_answer"),
      dial("c1", "2026-07-20T17:00:00Z", true, "booked"),
    ]);
    expect(r.get("c1")!.attempts).toBe(3);
    expect(r.get("c1")!.firstDialedAt).toBe("2026-07-20T09:00:00Z");
  });

  it("marks contacted when any dial spoke, regardless of order", () => {
    const r = rollUpByContact([
      dial("c1", "2026-07-20T09:00:00Z", true, "not_interested"),
      dial("c1", "2026-07-20T10:00:00Z", false, "no_answer"),
    ]);
    expect(r.get("c1")!.contacted).toBe(true);
  });

  it("takes the outcome of the most recent dial, not the last in the array", () => {
    const r = rollUpByContact([
      dial("c1", "2026-07-20T17:00:00Z", true, "booked"),
      dial("c1", "2026-07-20T09:00:00Z", false, "no_answer"),
    ]);
    expect(r.get("c1")!.lastOutcome).toBe("booked");
  });

  it("keeps contacts separate", () => {
    const r = rollUpByContact([
      dial("c1", "2026-07-20T09:00:00Z", true, "booked"),
      dial("c2", "2026-07-20T09:00:00Z", false, "no_answer"),
    ]);
    expect(r.get("c1")!.contacted).toBe(true);
    expect(r.get("c2")!.contacted).toBe(false);
  });
});

describe("computeRates", () => {
  it("returns null rates rather than NaN when there are no leads", () => {
    const r = computeRates([], new Map(), []);
    expect(r.totalLeads).toBe(0);
    expect(r.contactRate).toBeNull();
    expect(r.bookingRate).toBeNull();
  });

  it("counts a lead as contacted only via its own roll-up", () => {
    const leads = [{ contactId: "c1" }, { contactId: "c2" }];
    const rollUps = rollUpByContact([dial("c1", "2026-07-20T09:00:00Z", true, "booked")]);
    const r = computeRates(leads, rollUps, []);
    expect(r.totalLeads).toBe(2);
    expect(r.contactRate).toBeCloseTo(0.5);
  });

  it("never computes show or close rate", () => {
    const r = computeRates([{ contactId: "c1" }], new Map(), [{ contactId: "c1" }]);
    expect(r.showRate).toBeNull();
    expect(r.closeRate).toBeNull();
  });
});
