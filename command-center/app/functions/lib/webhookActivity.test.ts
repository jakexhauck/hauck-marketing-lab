import { describe, it, expect } from "vitest";
import { toActivity, shouldPush } from "./ghlEvents";

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
  // The call still lands in the feed; it just does not buzz. The phone is
  // already ringing, so a push would be a second alert for one event.
  it("does not push on inbound calls", () => {
    const a = toActivity("t1", { type: "InboundCall", contactId: "c1" } as any)!;
    expect(shouldPush(a)).toBe(false);
  });
});

describe("what wakes the phone", () => {
  it("pushes on a new lead and a booked appointment", () => {
    for (const type of ["OpportunityCreate", "AppointmentCreate"]) {
      expect(shouldPush(toActivity("t1", { type, contactId: "c1" } as any)!)).toBe(true);
    }
  });

  it("stays silent on outbound traffic and routine updates", () => {
    for (const type of [
      "OutboundMessage",
      "OpportunityStageUpdate",
      "AppointmentUpdate",
      "AppointmentDelete",
      "InvoicePaid",
    ]) {
      expect(shouldPush(toActivity("t1", { type, contactId: "c1" } as any)!)).toBe(false);
    }
  });
});

// The owner should be able to judge from the lock screen whether to stop what
// they are doing, without opening the app.
describe("inbound message summary", () => {
  function msg(extra: Record<string, unknown>) {
    return toActivity("t1", {
      type: "InboundMessage",
      contactId: "c1",
      ...extra,
    } as any)!;
  }

  it("shows the sender and their message", () => {
    expect(msg({ full_name: "Jane Doe", body: "Can you come Tuesday?" }).summary).toBe(
      "Jane Doe: Can you come Tuesday?",
    );
  });

  it("builds the name from first and last when there is no full name", () => {
    expect(msg({ first_name: "Jane", last_name: "Doe", body: "Hi" }).summary).toBe(
      "Jane Doe: Hi",
    );
  });

  it("reads the nested contact and message the Marketplace app sends", () => {
    expect(
      msg({ contact: { firstName: "Jane", lastName: "Doe" }, message: { body: "Hi" } })
        .summary,
    ).toBe("Jane Doe: Hi");
  });

  it("falls back to the message alone when the name is missing", () => {
    expect(msg({ body: "Can you come Tuesday?" }).summary).toBe("Can you come Tuesday?");
  });

  // Jake's instruction: the text if we can get it, otherwise at least the name.
  it("falls back to the name alone when the text is missing", () => {
    expect(msg({ full_name: "Jane Doe" }).summary).toBe("Jane Doe");
  });

  it("falls back to a bare label when the payload carries neither", () => {
    expect(msg({}).summary).toBe("Inbound message");
  });

  it("collapses newlines so the notification stays on one line", () => {
    expect(msg({ body: "123 Main St\n\nApt 4" }).summary).toBe("123 Main St Apt 4");
  });

  it("truncates a long message rather than filling the lock screen", () => {
    const s = msg({ body: "x".repeat(300) }).summary;
    expect(s.length).toBe(140);
    expect(s.endsWith("...")).toBe(true);
  });

  it("still pushes, and keeps the raw payload for diagnosis", () => {
    const a = msg({ full_name: "Jane Doe", body: "Hi" });
    expect(shouldPush(a)).toBe(true);
    expect((a.raw as Record<string, unknown>).body).toBe("Hi");
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

  // A win is still recorded as a win in the feed. It no longer buzzes: it is
  // something the owner just did, not something waiting on them.
  it("records a win without waking the phone", () => {
    const a = toActivity("t1", ev("Won"))!;
    expect(a.summary).toBe("Lead won");
    expect(shouldPush(a)).toBe(false);
  });

  it("treats Won Recurring as a win too", () => {
    const a = toActivity("t1", ev("Won Recurring"))!;
    expect(a.summary).toBe("Lead won");
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
