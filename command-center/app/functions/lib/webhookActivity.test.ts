import { describe, it, expect } from "vitest";
import { toActivity, shouldPush } from "../api/webhook";

describe("InboundCall webhook mapping", () => {
  it("maps InboundCall to a call_inbound activity", () => {
    const a = toActivity("t1", {
      type: "InboundCall",
      contactId: "c1",
      phone: "(248) 555-0188",
    } as any);
    expect(a?.kind).toBe("call_inbound");
    expect(a?.contact_id).toBe("c1");
  });
  it("pushes on inbound calls", () => {
    const a = toActivity("t1", { type: "InboundCall", contactId: "c1" } as any)!;
    expect(shouldPush(a)).toBe(true);
  });
});

// The type Jake's own GHL workflows post, one per status in the 12-status model.
describe("LeadStatusUpdate webhook mapping", () => {
  function ev(status: string, extra: Record<string, unknown> = {}) {
    return {
      type: "LeadStatusUpdate",
      locationId: "loc1",
      contactId: "c1",
      opportunityId: "o1",
      status,
      ...extra,
    } as any;
  }

  it("records the status as a readable feed row", () => {
    const a = toActivity("t1", ev("Estimate Booked"));
    expect(a?.kind).toBe("stage_changed");
    expect(a?.summary).toBe("Estimate Booked");
    expect(a?.contact_id).toBe("c1");
    expect(a?.opportunity_id).toBe("o1");
  });

  it("collapses every No Answer Day N stage under one status", () => {
    // All four (and any Jake adds later) post status=Phone Follow Up and carry
    // the specific stage along for the record.
    for (const day of [1, 2, 3, 9]) {
      const a = toActivity(
        "t1",
        ev("Phone Follow Up", { stage: `No Answer Day ${day} (needs dialing)` }),
      );
      expect(a?.summary).toBe("Phone Follow Up");
    }
  });

  it("treats a win as a win, so the client's phone wakes up", () => {
    const a = toActivity("t1", ev("Won"))!;
    expect(a.summary).toBe("Lead won");
    expect(shouldPush(a)).toBe(true);
  });

  it("treats Won Recurring as a win too", () => {
    const a = toActivity("t1", ev("Won Recurring"))!;
    expect(shouldPush(a)).toBe(true);
  });

  it("does not push on the routine statuses", () => {
    for (const s of ["New", "Phone Follow Up", "Handed Off", "Lost"]) {
      expect(shouldPush(toActivity("t1", ev(s))!)).toBe(false);
    }
  });

  it("still records an event that arrives without a status", () => {
    const a = toActivity("t1", ev(""));
    expect(a?.kind).toBe("stage_changed");
    expect(a?.summary).toBe("Stage changed");
  });

  it("keeps the raw payload so a mis-mapped workflow can be diagnosed", () => {
    const a = toActivity("t1", ev("Handed Off", { stage: "Handed Off" }));
    expect((a?.raw as Record<string, unknown>).stage).toBe("Handed Off");
  });
});
