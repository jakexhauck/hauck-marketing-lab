import { describe, it, expect } from "vitest";
import { validateNoteBody } from "./notes";

describe("validateNoteBody", () => {
  const good = { tenantId: "t1", contactId: "c1", body: "Spoke to spouse, call after 5pm" };

  it("accepts a complete body", () => {
    expect(validateNoteBody(good)).toEqual({ ok: true });
  });

  it("rejects a missing or blank tenant id", () => {
    expect(validateNoteBody({ ...good, tenantId: undefined }).code).toBe("missing_tenant_id");
    expect(validateNoteBody({ ...good, tenantId: "  " }).code).toBe("missing_tenant_id");
  });

  it("rejects a missing or blank contact id", () => {
    expect(validateNoteBody({ ...good, contactId: undefined }).code).toBe("missing_contact_id");
    expect(validateNoteBody({ ...good, contactId: "" }).code).toBe("missing_contact_id");
  });

  it("rejects an empty or whitespace-only note", () => {
    expect(validateNoteBody({ ...good, body: undefined }).code).toBe("empty_note");
    expect(validateNoteBody({ ...good, body: "   " }).code).toBe("empty_note");
  });
});
