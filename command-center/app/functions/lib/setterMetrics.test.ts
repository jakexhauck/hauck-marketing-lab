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

  it("orders by real instant, not string, across mixed UTC-offset representations", () => {
    // "2026-07-20T23:00:00-04:00" is 2026-07-21T03:00:00Z: chronologically LATER
    // than "2026-07-21T00:30:00Z", even though its string sorts EARLIER (the
    // "20" before "21"). A raw string compare would pick this row as the
    // earliest dial and its outcome as the latest one; both are wrong.
    const r = rollUpByContact([
      dial("c1", "2026-07-20T23:00:00-04:00", false, "no_answer"),
      dial("c1", "2026-07-21T00:30:00Z", true, "booked"),
    ]);
    expect(r.get("c1")!.firstDialedAt).toBe("2026-07-21T00:30:00Z");
    expect(r.get("c1")!.lastOutcome).toBe("no_answer");
  });

  it("treats an unparseable dialed_at as attempted but does not let it win ordering over a real timestamp", () => {
    const r = rollUpByContact([
      dial("c1", "not-a-date", false, "no_answer"),
      dial("c1", "2026-07-20T09:00:00Z", true, "booked"),
    ]);
    expect(r.get("c1")!.attempts).toBe(2);
    expect(r.get("c1")!.firstDialedAt).toBe("2026-07-20T09:00:00Z");
    expect(r.get("c1")!.lastOutcome).toBe("booked");
  });

  it("falls back to the raw value when no dial for a contact has a parseable timestamp", () => {
    const r = rollUpByContact([dial("c1", "", false, "no_answer")]);
    expect(r.get("c1")!.attempts).toBe(1);
    expect(r.get("c1")!.firstDialedAt).toBe("");
    expect(r.get("c1")!.lastOutcome).toBe("no_answer");
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

  it("pins bookingRate to a real fraction of leads booked", () => {
    const leads = [{ contactId: "c1" }, { contactId: "c2" }, { contactId: "c3" }];
    const r = computeRates(leads, new Map(), [{ contactId: "c2" }]);
    expect(r.bookingRate).toBeCloseTo(1 / 3);
  });

  it("uses lead count as the bookingRate denominator, not appointment count", () => {
    // Three appointments land, but only one lead. If the denominator were
    // accidentally the appointment count, this would compute 1/3 instead of 1.
    const leads = [{ contactId: "c1" }];
    const appointments = [{ contactId: "c1" }, { contactId: "c2" }, { contactId: "c3" }];
    const r = computeRates(leads, new Map(), appointments);
    expect(r.bookingRate).toBe(1);
  });

  it("does not let an appointment for a non-lead contact inflate bookingRate", () => {
    const leads = [{ contactId: "c1" }, { contactId: "c2" }];
    const appointments = [{ contactId: "c2" }, { contactId: "not-a-lead" }];
    const r = computeRates(leads, new Map(), appointments);
    expect(r.bookingRate).toBeCloseTo(0.5);
  });
});
