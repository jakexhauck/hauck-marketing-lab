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
