import { describe, expect, it } from "vitest";
import { onRequestGet } from "./crm";
import type { Env } from "../../../lib/env";

// One field leaves this route, and one must not. The token sits next to the
// location id in the same context object, so the test that matters is the one
// asserting what is absent.

function call(env: Partial<Env>) {
  return onRequestGet({ env } as Parameters<typeof onRequestGet>[0]) as Promise<Response>;
}

describe("GET /api/admin/cold-call/crm", () => {
  it("returns the agency location id when the account is connected", async () => {
    const res = await call({
      AGENCY_GHL_LOCATION_ID: "loc_agency",
      AGENCY_GHL_TOKEN: "pit-secret",
    });
    await expect(res.json()).resolves.toEqual({ configured: true, locationId: "loc_agency" });
  });

  it("never returns the token", async () => {
    const res = await call({
      AGENCY_GHL_LOCATION_ID: "loc_agency",
      AGENCY_GHL_TOKEN: "pit-secret",
    });
    expect(await res.text()).not.toContain("pit-secret");
  });

  it("says unconfigured rather than half-configured", async () => {
    // A location id with no token cannot dial, and handing it out would put a
    // "Dial in GoHighLevel" button on a card that opens an account the app has
    // no credentials for.
    const res = await call({ AGENCY_GHL_LOCATION_ID: "loc_agency" });
    await expect(res.json()).resolves.toEqual({ configured: false, locationId: "" });
  });

  it("says unconfigured when neither secret is set", async () => {
    const res = await call({});
    await expect(res.json()).resolves.toEqual({ configured: false, locationId: "" });
  });
});
