import { describe, it, expect } from "vitest";
import { validateTagsBody } from "./tags";

// validateTagsBody is the only pure logic in this route (the rest is a live
// CRM round-trip), so this covers every 400 path before a request ever
// reaches the tags API.

describe("validateTagsBody", () => {
  it("requires tenantId and contactId", () => {
    expect(validateTagsBody({ contactId: "c", add: ["x"] }).ok).toBe(false);
    expect(validateTagsBody({ tenantId: "t", add: ["x"] }).ok).toBe(false);
  });

  it("rejects a body with neither add nor remove", () => {
    const r = validateTagsBody({ tenantId: "t", contactId: "c" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("nothing_to_do");
  });

  it("rejects a body where add and remove are both empty arrays", () => {
    const r = validateTagsBody({ tenantId: "t", contactId: "c", add: [], remove: [] });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("nothing_to_do");
  });

  it("rejects a body where add/remove contain only blank strings", () => {
    const r = validateTagsBody({ tenantId: "t", contactId: "c", add: ["  ", ""] });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("nothing_to_do");
  });

  it("accepts add only", () => {
    expect(validateTagsBody({ tenantId: "t", contactId: "c", add: ["hot lead"] }).ok).toBe(true);
  });

  it("accepts remove only", () => {
    expect(validateTagsBody({ tenantId: "t", contactId: "c", remove: ["cold"] }).ok).toBe(true);
  });

  it("accepts both add and remove together", () => {
    expect(
      validateTagsBody({ tenantId: "t", contactId: "c", add: ["hot"], remove: ["cold"] }).ok,
    ).toBe(true);
  });
});
