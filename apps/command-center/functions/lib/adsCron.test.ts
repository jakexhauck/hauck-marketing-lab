import { describe, it, expect } from "vitest";
import { ADS_CRON_PATH, ADS_CRON_HEADER, MIN_SECRET_LENGTH, isAdsCronRequest } from "./adsCron";

// A 40-char secret: comfortably over the minimum, so these tests exercise the
// real decision rather than the length guard.
const SECRET = "3a91c7e5b2d84f60a1c7e5b2d84f60a1c7e5b2d8";

function ask(over: Partial<{ method: string; path: string; header: string | null; secret?: string }> = {}) {
  return isAdsCronRequest(
    over.method ?? "POST",
    over.path ?? ADS_CRON_PATH,
    "header" in over ? over.header! : SECRET,
    "secret" in over ? over.secret : SECRET,
  );
}

describe("ads cron auth", () => {
  it("lets the scheduler through with the right secret", () => {
    expect(ask()).toBe(true);
  });

  it("refuses a wrong secret of the same length", () => {
    // Same length on purpose: proves the comparison looks at content, not just
    // at the cheap length check that runs first.
    expect(ask({ header: "0".repeat(SECRET.length) })).toBe(false);
  });

  it("refuses a missing header", () => {
    expect(ask({ header: null })).toBe(false);
  });

  it("refuses a header that is a prefix of the secret", () => {
    expect(ask({ header: SECRET.slice(0, 10) })).toBe(false);
  });

  it("grants nothing but the sync route", () => {
    // The whole point of the gate. This secret buys one sync, not a way into
    // any other admin route, and least of all a writing one.
    for (const path of [
      "/api/admin/ads",
      "/api/admin/ads/sync/",
      "/api/admin/ads/syncx",
      "/api/admin/ads/sync/../../secrets/agency",
      "/api/admin/secrets/agency",
      "/api/admin/clients",
      "/api/admin/",
    ]) {
      expect(ask({ path }), `${path} must stay closed`).toBe(false);
    }
  });

  it("passes POST and nothing else", () => {
    // Unlike the health gate this one is a write, so the allowed verb is POST.
    // Every other method still has to fall through to the session gate.
    for (const method of ["GET", "PATCH", "DELETE", "PUT", "OPTIONS", "HEAD"]) {
      expect(ask({ method }), `${method} must not pass`).toBe(false);
    }
  });

  it("stays off entirely when no secret is configured", () => {
    // Unset must mean closed, never "anything matches". A blank or whitespace
    // secret is the same as unset.
    expect(ask({ secret: undefined, header: "anything" })).toBe(false);
    expect(ask({ secret: "", header: "" })).toBe(false);
    expect(ask({ secret: "   ", header: "   " })).toBe(false);
  });

  it("refuses a secret too short to be worth brute-force protection", () => {
    const weak = "hunter2";
    expect(weak.length).toBeLessThan(MIN_SECRET_LENGTH);
    // Refused rather than quietly accepted: the cron then fails loudly with a
    // 401 in the worker log, which is the safe direction to be wrong in.
    expect(ask({ secret: weak, header: weak })).toBe(false);
  });

  it("names the header the scheduler has to send", () => {
    expect(ADS_CRON_HEADER).toBe("x-ads-cron");
  });

  it("does not share the health cron's header or path", () => {
    // Two secrets, two doors. Reusing either would mean the read-only probe's
    // secret could trigger a write.
    expect(ADS_CRON_HEADER).not.toBe("x-health-cron");
    expect(ADS_CRON_PATH).not.toBe("/api/admin/connections/health");
  });
});
