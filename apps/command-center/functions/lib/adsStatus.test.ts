import { describe, it, expect } from "vitest";
import { FRESH_MINUTES, isStale, toAdsStatus } from "./adsStatus";

const row = (over: Record<string, unknown> = {}) => ({
  synced_at: "2026-09-22T19:00:00Z",
  checked_at: "2026-09-22T19:00:01Z",
  ok: true,
  days_checked: 70,
  stored_spend: "1777.00",
  meta_spend: "1777.00",
  stored_leads: 105,
  meta_leads: 105,
  first_spend_date: "2026-07-15",
  mismatches: [],
  error: null,
  ...over,
});

describe("toAdsStatus", () => {
  it("is launched once Meta has recorded spend", () => {
    const s = toAdsStatus(true, row());
    expect(s.launched).toBe(true);
    expect(s.verified).toBe(true);
    expect(s.metaSpend).toBe(1777);
  });

  it("is not launched with an ad account but no spend yet", () => {
    expect(toAdsStatus(true, row({ first_spend_date: null })).launched).toBe(false);
  });

  it("is not launched with no ad account, whatever a stale row says", () => {
    expect(toAdsStatus(false, row()).launched).toBe(false);
    expect(toAdsStatus(false, null).launched).toBe(false);
  });

  it("stays launched when the latest check failed", () => {
    const s = toAdsStatus(true, row({ ok: false, error: "Meta 500" }));
    expect(s.launched).toBe(true);
    expect(s.verified).toBe(false);
  });

  it("reads verified as unknown before any check", () => {
    expect(toAdsStatus(true, null).verified).toBeNull();
  });
});

describe("isStale", () => {
  const now = Date.parse("2026-09-22T20:00:00Z");
  it("treats never-synced as stale", () => expect(isStale(null, now)).toBe(true));
  it("is fresh inside the window", () =>
    expect(isStale(new Date(now - (FRESH_MINUTES - 1) * 60_000).toISOString(), now)).toBe(false));
  it("is stale past the window", () =>
    expect(isStale(new Date(now - (FRESH_MINUTES + 1) * 60_000).toISOString(), now)).toBe(true));
});
