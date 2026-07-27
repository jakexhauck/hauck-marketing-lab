import { describe, it, expect } from "vitest";
import { HEALTH_CRON_PATH, HEALTH_CRON_HEADER, MIN_SECRET_LENGTH, isHealthCronRequest } from "./healthCron";

// A 40-char secret: comfortably over the minimum, so these tests exercise the
// real decision rather than the length guard.
const SECRET = "b7f2c9d4e1a68350f9c2b7d4e1a68350f9c2b7d4";

function ask(over: Partial<{ method: string; path: string; header: string | null; secret?: string }> = {}) {
  return isHealthCronRequest(
    over.method ?? "GET",
    over.path ?? HEALTH_CRON_PATH,
    "header" in over ? over.header! : SECRET,
    "secret" in over ? over.secret : SECRET,
  );
}

describe("health cron auth", () => {
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

  it("grants nothing but the health route", () => {
    // The whole point of the gate. Holding the cron secret must not open any
    // other admin route, least of all the one that reads credentials.
    for (const path of [
      "/api/admin/secrets/agency",
      "/api/admin/secrets/client/abc",
      "/api/admin/connections/health/../secrets/agency",
      "/api/admin/connections",
      "/api/admin/connections/healthz",
      "/api/admin/audit",
      "/api/admin/",
    ]) {
      expect(ask({ path }), `${path} must stay closed`).toBe(false);
    }
  });

  it("is read-only: only GET passes", () => {
    for (const method of ["POST", "PATCH", "DELETE", "PUT", "OPTIONS", "HEAD"]) {
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
    expect(HEALTH_CRON_HEADER).toBe("x-health-cron");
  });
});
