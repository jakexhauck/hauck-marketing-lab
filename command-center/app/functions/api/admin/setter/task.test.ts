import { describe, it, expect } from "vitest";
import { validateTaskBody } from "./task";

// validateTaskBody is the only pure logic in this route (the rest is a live
// CRM round-trip), so this covers every 400 path before a request ever
// reaches the task API.

describe("validateTaskBody", () => {
  it("requires tenantId", () => {
    const r = validateTaskBody({ contactId: "c", title: "t" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_tenant_id");
  });

  it("requires contactId", () => {
    const r = validateTaskBody({ tenantId: "t", title: "t" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_contact_id");
  });

  it("requires a non-blank title", () => {
    const r = validateTaskBody({ tenantId: "t", contactId: "c", title: "   " });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("empty_title");
  });

  it("accepts a complete body", () => {
    expect(validateTaskBody({ tenantId: "t", contactId: "c", title: "Follow up" }).ok).toBe(true);
  });
});
