import { describe, it, expect } from "vitest";
import {
  FULFILLMENT_PAGES,
  DEFAULT_FULFILLMENT_PAGE,
  isFulfillmentPage,
  legacyFulfillmentPage,
  subTabsFor,
  placeholderCopy,
  paidAdsSubTabs,
  ghlSubTabs,
  ADS_SETUP_SUB,
  GHL_SETUP_SUB,
} from "./fulfillmentPages";

describe("fulfillmentPages config", () => {
  it("carries only the services we actually deliver", () => {
    expect(FULFILLMENT_PAGES.map((p) => p.id)).toEqual([
      "software",
      "paid-ads",
      "ghl",
      "management",
    ]);
  });

  it("has no unbuilt pages left in the rail", () => {
    expect(FULFILLMENT_PAGES.every((p) => p.ready)).toBe(true);
  });

  it("has unique page ids and unique sub-tab ids within a page", () => {
    const ids = FULFILLMENT_PAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const page of FULFILLMENT_PAGES) {
      const subs = (page.subTabs ?? []).map((s) => s.id);
      expect(new Set(subs).size).toBe(subs.length);
    }
  });

  it("defaults to a page that is actually built", () => {
    expect(FULFILLMENT_PAGES.find((p) => p.id === DEFAULT_FULFILLMENT_PAGE)?.ready).toBe(true);
  });

  it("never marks a page ready while all of its sub-tabs are not", () => {
    for (const page of FULFILLMENT_PAGES) {
      if (page.ready && page.subTabs?.length) {
        expect(page.subTabs.some((s) => s.ready)).toBe(true);
      }
    }
  });
});

describe("legacyFulfillmentPage", () => {
  it("keeps a tab that is still a page", () => {
    expect(legacyFulfillmentPage("paid-ads")).toBe("paid-ads");
  });

  it("sends the retired paperwork tabs to Management", () => {
    expect(legacyFulfillmentPage("billing")).toBe("management");
    expect(legacyFulfillmentPage("config")).toBe("management");
  });

  it("sends the retired service tabs to the default page", () => {
    for (const tab of ["overview", "web-design", "google-reviews", "reactivation"]) {
      expect(legacyFulfillmentPage(tab)).toBe(DEFAULT_FULFILLMENT_PAGE);
    }
  });

  it("falls back to the default for an absent or unknown tab", () => {
    expect(legacyFulfillmentPage(null)).toBe(DEFAULT_FULFILLMENT_PAGE);
    expect(legacyFulfillmentPage("nonsense")).toBe(DEFAULT_FULFILLMENT_PAGE);
  });
});

describe("isFulfillmentPage", () => {
  it("accepts a known id and rejects anything else", () => {
    expect(isFulfillmentPage("management")).toBe(true);
    expect(isFulfillmentPage("billing")).toBe(false);
    expect(isFulfillmentPage("clients")).toBe(false);
    expect(isFulfillmentPage(null)).toBe(false);
    expect(isFulfillmentPage(undefined)).toBe(false);
  });
});

describe("subTabsFor", () => {
  it("returns [] for a page with no second level", () => {
    expect(subTabsFor("management")).toEqual([]);
    expect(subTabsFor("nope")).toEqual([]);
  });

  it("lists Paid Ads' pages, Dashboard first", () => {
    expect(subTabsFor("paid-ads")[0].id).toBe("dashboard");
  });
});

describe("paidAdsSubTabs", () => {
  const subs = subTabsFor("paid-ads");

  it("offers every page once the ad account is linked", () => {
    expect(paidAdsSubTabs(subs, true)).toEqual(subs);
  });

  // The three Meta-backed pages are the whole point of the gate: without an ad
  // account they can only draw zeroes, which reads as a quiet month.
  it("hides the Meta pages and opens on the wizard when it is not", () => {
    expect(paidAdsSubTabs(subs, false).map((s) => s.id)).toEqual([
      ADS_SETUP_SUB,
      "creatives",
      "ad-builder",
    ]);
  });

  it("puts the wizard first, so that is where the page lands", () => {
    expect(paidAdsSubTabs(subs, false)[0].id).toBe(ADS_SETUP_SUB);
    expect(paidAdsSubTabs(subs, false)[0].label).toBe("Connect ads");
  });
});

describe("ghlSubTabs", () => {
  const subs = subTabsFor("ghl");

  // The wiring screen is a setup step, not a tab you can go back to. A wired
  // client has two sub-tabs and nowhere to read event health, by design.
  it("offers no wiring screen once the client is connected", () => {
    expect(ghlSubTabs(subs, true).map((s) => s.id)).toEqual([
      "conversion-assets",
      "calendars",
    ]);
  });

  it("opens on the wizard and hides Calendars while unwired", () => {
    const gated = ghlSubTabs(subs, false);
    expect(gated.map((s) => s.id)).toEqual([GHL_SETUP_SUB, "conversion-assets"]);
    expect(gated[0].label).toBe("Connect GHL");
  });

});

describe("placeholderCopy", () => {
  it("names the surface that is not built yet", () => {
    expect(placeholderCopy("Ad Tracking")).toBe("Ad Tracking is coming in a later phase.");
  });
});
