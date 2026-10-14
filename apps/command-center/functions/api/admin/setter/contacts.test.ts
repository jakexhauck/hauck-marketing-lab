import { describe, it, expect } from "vitest";
import { parseContactsQuery, shapeContact } from "./contacts";

// parseContactsQuery and shapeContact are the only pure logic in this route
// (the rest is a live CRM round-trip), so this covers every 400 path plus the
// display-name fallbacks a setter actually sees in the picker.

function qs(pairs: Record<string, string>): URLSearchParams {
  return new URLSearchParams(pairs);
}

describe("parseContactsQuery", () => {
  it("requires tenantId", () => {
    const r = parseContactsQuery(qs({ q: "beck" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_tenant_id");
  });

  it("rejects a blank tenantId", () => {
    const r = parseContactsQuery(qs({ tenantId: "   ", q: "beck" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_tenant_id");
  });

  it("rejects a missing query", () => {
    const r = parseContactsQuery(qs({ tenantId: "t1" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_query");
  });

  // A one-character query would return most of the location's contact list,
  // so it is rejected rather than served.
  it("rejects a query under two characters", () => {
    const r = parseContactsQuery(qs({ tenantId: "t1", q: "b" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_query");
  });

  it("rejects a query that is only whitespace padding", () => {
    const r = parseContactsQuery(qs({ tenantId: "t1", q: "   b   " }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_query");
  });

  it("trims and accepts a real query", () => {
    const r = parseContactsQuery(qs({ tenantId: "  t1  ", q: " beck " }));
    expect(r).toEqual({ ok: true, query: { tenantId: "t1", q: "beck" } });
  });
});

describe("shapeContact", () => {
  it("builds a display name from first and last", () => {
    expect(
      shapeContact({ id: "k1", firstName: "Tom", lastName: "Beckett", phone: "+13135550142" }),
    ).toEqual({ id: "k1", name: "Tom Beckett", phone: "+13135550142", email: "" });
  });

  it("prefers contactName when GHL supplies it", () => {
    expect(shapeContact({ id: "k2", contactName: "Ruth Okafor", email: "r@example.com" })).toEqual({
      id: "k2",
      name: "Ruth Okafor",
      phone: "",
      email: "r@example.com",
    });
  });

  it("uses a lone first name rather than skipping to the phone", () => {
    expect(shapeContact({ id: "k5", firstName: "Ruth", phone: "+13135550101" })).toEqual({
      id: "k5",
      name: "Ruth",
      phone: "+13135550101",
      email: "",
    });
  });

  it("falls back to the phone number when there is no name at all", () => {
    expect(shapeContact({ id: "k3", phone: "+15865550198" })).toEqual({
      id: "k3",
      name: "+15865550198",
      phone: "+15865550198",
      email: "",
    });
  });

  it("falls back to Unknown contact when there is nothing to show", () => {
    expect(shapeContact({ id: "k4" })).toEqual({
      id: "k4",
      name: "Unknown contact",
      phone: "",
      email: "",
    });
  });
});
