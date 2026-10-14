import { describe, it, expect } from "vitest";
import { validateCancelApptBody } from "./cancel-appointment";

// validateCancelApptBody is the only pure logic in this route (the rest is a
// live CRM round-trip), so this covers every 400 path before a request ever
// reaches the calendar API.

describe("validateCancelApptBody", () => {
  it("requires tenantId", () => {
    const r = validateCancelApptBody({ eventId: "ev" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_tenant_id");
  });

  it("requires eventId", () => {
    const r = validateCancelApptBody({ tenantId: "t" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_event_id");
  });

  it("rejects blank values", () => {
    expect(validateCancelApptBody({ tenantId: "  ", eventId: "ev" }).ok).toBe(false);
    expect(validateCancelApptBody({ tenantId: "t", eventId: "  " }).ok).toBe(false);
  });

  it("accepts a complete body", () => {
    expect(validateCancelApptBody({ tenantId: "t", eventId: "ev" }).ok).toBe(true);
  });
});
