import { describe, it, expect } from "vitest";
import { normalizeAdsInsights, emptyAdsInsights } from "./adsInsights";

describe("normalizeAdsInsights", () => {
  it("fills a bare { configured: false } payload with safe empties", () => {
    // The endpoint returns exactly this when Meta isn't wired yet. Destructuring
    // totals/ads off it used to white-screen every Paid Ads tab.
    const out = normalizeAdsInsights({ configured: false });
    expect(out.configured).toBe(false);
    expect(out.totals.spend).toBe(0);
    expect(out.ads).toEqual([]);
    expect(out.weekly).toEqual([]);
    expect(out.sources).toEqual({ fb: 0, ig: 0 });
  });

  it("falls back to the empty (not-connected) shape for null/undefined", () => {
    expect(normalizeAdsInsights(undefined)).toEqual(emptyAdsInsights(false));
    expect(normalizeAdsInsights(null)).toEqual(emptyAdsInsights(false));
  });

  it("passes a full payload through untouched", () => {
    const full = emptyAdsInsights(true);
    full.totals.spend = 500;
    full.ads = [{ id: "1", headline: "A", copy: "", platforms: ["fb"], active: true, leads: 3, reach: 10, spend: 100 }];
    const out = normalizeAdsInsights(full);
    expect(out.totals.spend).toBe(500);
    expect(out.ads).toHaveLength(1);
    expect(out.configured).toBe(true);
  });

  it("backfills a partial totals object without dropping present values", () => {
    const out = normalizeAdsInsights({ configured: true, totals: { spend: 42 } });
    expect(out.totals.spend).toBe(42);
    expect(out.totals.leads).toBe(0);
    expect(out.totals.roas).toBe(0);
  });
});
