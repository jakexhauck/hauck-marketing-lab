import { describe, it, expect } from "vitest";
import { buildHealthAlert, baseConnectionId } from "./healthAlert";
import type { HealthSnapshotRow } from "./healthSnapshots";

function broke(connectionId: string, label: string, detail = "Returned 401"): HealthSnapshotRow {
  return { connectionId, label, state: "down", detail };
}

describe("baseConnectionId", () => {
  it("passes an agency id through untouched", () => {
    expect(baseConnectionId("meta-ads")).toBe("meta-ads");
  });

  it("recovers the registry id from a per-client row", () => {
    expect(baseConnectionId("client:willis-windows:ghl")).toBe("ghl");
  });

  it("survives a slug containing a colon", () => {
    // The id is the LAST segment, so a slug that somehow contains a colon
    // cannot shift which connection the alert claims broke.
    expect(baseConnectionId("client:odd:slug:meta-ads")).toBe("meta-ads");
  });
});

describe("buildHealthAlert", () => {
  it("is silent when nothing broke", () => {
    expect(buildHealthAlert([])).toBeNull();
  });

  it("names the thing and what it costs, not the key", () => {
    // The whole point. "META_SYSTEM_USER_TOKEN is missing" tells you nothing at
    // 3am; "Paid Ads goes dark" tells you whether to get up.
    const alert = buildHealthAlert([broke("meta-ads", "Meta Ads")]);
    expect(alert?.title).toBe("Meta Ads stopped working");
    expect(alert?.body).toContain("Paid Ads");
    expect(alert?.body).not.toContain("META_SYSTEM_USER_TOKEN");
  });

  it("sends you to the page that explains it", () => {
    expect(buildHealthAlert([broke("meta-ads", "Meta Ads")])?.url).toBe("/admin/settings");
  });

  it("summarises when several break at once", () => {
    // A deploy that blanks the environment breaks everything simultaneously.
    // Three separate buzzes would say less than one that counts them.
    const alert = buildHealthAlert([
      broke("meta-ads", "Meta Ads"),
      broke("ga4", "Google Analytics"),
      broke("supabase", "Supabase"),
    ]);
    expect(alert?.title).toBe("3 connections stopped working");
    expect(alert?.body).toContain("Meta Ads");
    expect(alert?.body).toContain("Supabase");
  });

  it("names the client when it is one client's own credential", () => {
    // "GoHighLevel stopped working" would read as every client being down.
    const alert = buildHealthAlert([
      broke("client:willis-windows:ghl", "Willis Windows: GoHighLevel"),
    ]);
    expect(alert?.title).toBe("Willis Windows: GoHighLevel stopped working");
  });

  it("still explains the consequence for a per-client row", () => {
    const alert = buildHealthAlert([
      broke("client:willis-windows:ghl", "Willis Windows: GoHighLevel"),
    ]);
    // Resolved through the base id, so the client row inherits the same
    // consequence line as the agency connection it is an instance of.
    expect(alert?.body.length).toBeGreaterThan(10);
    expect(alert?.body).not.toBe("Returned 401");
  });

  it("falls back to the probe detail when the id is not in the registry", () => {
    // A row written before a connection was renamed must still say something
    // useful rather than crashing or going blank.
    const alert = buildHealthAlert([broke("long-gone", "Long Gone", "Returned 500")]);
    expect(alert?.title).toBe("Long Gone stopped working");
    expect(alert?.body).toBe("Returned 500");
  });

  it("keeps the body short enough for a notification", () => {
    const many = Array.from({ length: 12 }, (_, i) => broke(`c${i}`, `Connection number ${i}`));
    const alert = buildHealthAlert(many);
    expect(alert?.title).toBe("12 connections stopped working");
    expect(alert!.body.length).toBeLessThanOrEqual(160);
    expect(alert?.body).toContain("more");
  });
});
