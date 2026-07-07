import { describe, it, expect } from "vitest";
import { resolveGhlCreds } from "./tenantResolve";

// resolveGhlCreds mirrors the live middleware's tenant-vs-env fallback so
// admin-tenant endpoints resolve GHL creds the same way the client path does.
// The bug it fixes: a tenant whose row still holds placeholder creds ('env')
// worked on the client path (env fallback) but 401'd on the admin path, which
// read tenant.ghl_token raw.

const ENV = { GHL_LOCATION_ID: "envLoc", GHL_TOKEN: "envTok" };

describe("resolveGhlCreds", () => {
  it("uses the tenant's own creds when they are real", () => {
    expect(
      resolveGhlCreds({ ghl_location_id: "loc123", ghl_token: "tok123" }, ENV),
    ).toEqual({ locationId: "loc123", token: "tok123" });
  });

  it("falls back to env creds when the tenant creds are the 'env' placeholder", () => {
    expect(
      resolveGhlCreds({ ghl_location_id: "env", ghl_token: "env" }, ENV),
    ).toEqual({ locationId: "envLoc", token: "envTok" });
  });

  it("treats empty and 'pending' as placeholders and falls back to env", () => {
    expect(resolveGhlCreds({ ghl_location_id: "", ghl_token: "" }, ENV)).toEqual({
      locationId: "envLoc",
      token: "envTok",
    });
    expect(
      resolveGhlCreds({ ghl_location_id: "pending", ghl_token: "pending" }, ENV),
    ).toEqual({ locationId: "envLoc", token: "envTok" });
  });

  it("falls back to env when either tenant cred is a placeholder (all-or-nothing)", () => {
    // Half-set-up row: real location but placeholder token -> not GHL-wired yet.
    expect(
      resolveGhlCreds({ ghl_location_id: "loc123", ghl_token: "env" }, ENV),
    ).toEqual({ locationId: "envLoc", token: "envTok" });
  });

  it("returns null when placeholders fall back to unset env creds", () => {
    expect(
      resolveGhlCreds(
        { ghl_location_id: "env", ghl_token: "env" },
        { GHL_LOCATION_ID: "", GHL_TOKEN: "" },
      ),
    ).toBeNull();
  });
});
