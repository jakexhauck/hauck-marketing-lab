import { describe, it, expect } from "vitest";
import { resolveGhlCreds, tenantHasGhlCreds } from "./tenantResolve";

// resolveGhlCreds decides which GoHighLevel sub-account a request reads. There
// is exactly one right answer: the client's own, or none.
//
// It used to fall back to the GHL_LOCATION_ID / GHL_TOKEN env vars when a
// tenant's row still held placeholder creds ('env', 'pending', ''). That was
// written when there was one client and the env vars were effectively that
// client's own creds. With more than one client it is a cross-tenant leak
// wearing a helpful face: the env vars hold a REAL client's credentials, so a
// half-wired client did not show an empty page, it showed Willis Windows'
// leads, conversations, calendar and revenue, with nothing on screen to say so.
//
// Now a client with no creds of its own resolves to null, and every caller
// turns that into an honest "not connected yet".

describe("resolveGhlCreds", () => {
  it("uses the tenant's own creds when they are real", () => {
    expect(resolveGhlCreds({ ghl_location_id: "loc123", ghl_token: "tok123" })).toEqual({
      locationId: "loc123",
      token: "tok123",
    });
  });

  it("returns null for the 'env' placeholder rather than another client's account", () => {
    expect(resolveGhlCreds({ ghl_location_id: "env", ghl_token: "env" })).toBeNull();
  });

  it("returns null for the 'pending' placeholder and for blanks", () => {
    expect(resolveGhlCreds({ ghl_location_id: "", ghl_token: "" })).toBeNull();
    expect(resolveGhlCreds({ ghl_location_id: "pending", ghl_token: "pending" })).toBeNull();
  });

  it("is all-or-nothing: a real location with a placeholder token is not wired", () => {
    // The half-set-up row. Sending a real location id with a placeholder token
    // would 401 against GHL; pairing it with somebody else's token would be
    // very much worse.
    expect(resolveGhlCreds({ ghl_location_id: "loc123", ghl_token: "env" })).toBeNull();
    expect(resolveGhlCreds({ ghl_location_id: "pending", ghl_token: "tok123" })).toBeNull();
  });

  it("ignores case and padding on a placeholder", () => {
    expect(resolveGhlCreds({ ghl_location_id: " Pending ", ghl_token: " ENV " })).toBeNull();
  });
});

describe("tenantHasGhlCreds", () => {
  it("is the same question resolveGhlCreds answers, for callers that only need the yes or no", () => {
    expect(tenantHasGhlCreds({ ghl_location_id: "loc", ghl_token: "tok" })).toBe(true);
    expect(tenantHasGhlCreds({ ghl_location_id: "loc", ghl_token: "pending" })).toBe(false);
  });
});
