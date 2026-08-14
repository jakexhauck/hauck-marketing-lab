import { describe, it, expect } from "vitest";
import {
  FULFILLMENT_PAGES,
  FULFILLMENT_NAV,
  FULFILLMENT_HOME,
  DEFAULT_FULFILLMENT_PAGE,
  getFulfillmentPage,
  isFulfillmentPage,
  legacyFulfillmentPage,
  subTabsFor,
  resolveSubTab,
  fulfillmentPath,
  placeholderCopy,
  paidAdsSubTabs,
  ghlSubTabs,
  resolveGatedSubTab,
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
    expect(getFulfillmentPage(DEFAULT_FULFILLMENT_PAGE)?.ready).toBe(true);
  });

  it("never marks a page ready while all of its sub-tabs are not", () => {
    for (const page of FULFILLMENT_PAGES) {
      if (page.ready && page.subTabs?.length) {
        expect(page.subTabs.some((s) => s.ready)).toBe(true);
      }
    }
  });
});

describe("FULFILLMENT_NAV", () => {
  it("leads with Onboarding, because a client is stood up before anything else", () => {
    expect(FULFILLMENT_NAV[0]).toEqual({ to: "/admin/onboarding", label: "Onboarding" });
    expect(FULFILLMENT_HOME).toBe("/admin/onboarding");
  });

  it("lists the Setter Suite in the same run as the service pages", () => {
    expect(FULFILLMENT_NAV.map((r) => r.label)).toEqual([
      "Onboarding",
      "Software",
      "Paid Ads",
      "GHL",
      "Setter Suite",
      "Management",
    ]);
  });

  // The guard against the rail and the page config drifting apart.
  it("has a row for every page, and every page row points at a real page", () => {
    const rowPaths = new Set(FULFILLMENT_NAV.map((r) => r.to));
    for (const page of FULFILLMENT_PAGES) {
      expect(rowPaths.has(`/admin/fulfillment/${page.id}`)).toBe(true);
    }
    for (const row of FULFILLMENT_NAV) {
      const id = row.to.startsWith("/admin/fulfillment/")
        ? row.to.slice("/admin/fulfillment/".length)
        : null;
      if (id) expect(isFulfillmentPage(id)).toBe(true);
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

describe("isFulfillmentPage / getFulfillmentPage", () => {
  it("accepts a known id and rejects anything else", () => {
    expect(isFulfillmentPage("management")).toBe(true);
    expect(isFulfillmentPage("billing")).toBe(false);
    expect(isFulfillmentPage("clients")).toBe(false);
    expect(isFulfillmentPage(null)).toBe(false);
    expect(isFulfillmentPage(undefined)).toBe(false);
    expect(getFulfillmentPage("nope")).toBeNull();
  });
});

describe("subTabsFor / resolveSubTab", () => {
  it("returns [] and null for a page with no second level", () => {
    expect(subTabsFor("management")).toEqual([]);
    expect(resolveSubTab("management", "anything")).toBeNull();
  });

  it("keeps a valid sub-tab and falls back to the first otherwise", () => {
    expect(resolveSubTab("paid-ads", "creatives")).toBe("creatives");
    expect(resolveSubTab("paid-ads", "not-a-sub")).toBe("dashboard");
    expect(resolveSubTab("paid-ads", null)).toBe("dashboard");
  });

  // The retired ids (campaigns, ad-tracking, data-leads, ad-library) must not
  // resolve to themselves: a bookmark or a stale link lands on Dashboard rather
  // than the cockpit's "still building this view" dead end.
  it("lands a retired sub-tab id on Dashboard", () => {
    expect(resolveSubTab("paid-ads", "campaigns")).toBe("dashboard");
    expect(resolveSubTab("paid-ads", "ad-tracking")).toBe("dashboard");
    expect(resolveSubTab("paid-ads", "data-leads")).toBe("dashboard");
    expect(resolveSubTab("paid-ads", "ad-library")).toBe("dashboard");
  });

  it("resolves against an unknown page as if it had no sub-tabs", () => {
    expect(resolveSubTab("nope", "campaigns")).toBeNull();
  });
});

describe("fulfillmentPath", () => {
  it("builds a bare page path when there is no client yet", () => {
    expect(fulfillmentPath("software")).toBe("/admin/fulfillment/software");
    expect(fulfillmentPath("software", null)).toBe("/admin/fulfillment/software");
  });

  it("carries the client, and the sub-tab when there is one", () => {
    expect(fulfillmentPath("management", "t1")).toBe(
      "/admin/fulfillment/management?client=t1",
    );
    expect(fulfillmentPath("paid-ads", "t1", "meta-data")).toBe(
      "/admin/fulfillment/paid-ads?client=t1&sub=meta-data",
    );
  });

  it("escapes an id that would otherwise break the query string", () => {
    expect(fulfillmentPath("management", "a b&c")).toBe(
      "/admin/fulfillment/management?client=a+b%26c",
    );
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

describe("resolveGatedSubTab", () => {
  const open = subTabsFor("paid-ads");
  const gated = paidAdsSubTabs(open, false);

  it("keeps a sub-tab that is on offer", () => {
    expect(resolveGatedSubTab(gated, "ad-builder")).toBe("ad-builder");
  });

  // An old link, or the tab you were on when you switched to an unwired client.
  it("falls back to the wizard for a page the gate removed", () => {
    expect(resolveGatedSubTab(gated, "dashboard")).toBe(ADS_SETUP_SUB);
    expect(resolveGatedSubTab(gated, null)).toBe(ADS_SETUP_SUB);
  });

  it("answers null for a page with no sub-tabs at all", () => {
    expect(resolveGatedSubTab([], "anything")).toBeNull();
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

  it("sends a Calendars link for an unwired client to the wizard", () => {
    expect(resolveGatedSubTab(ghlSubTabs(subs, false), "calendars")).toBe(GHL_SETUP_SUB);
  });
});

describe("placeholderCopy", () => {
  it("names the surface that is not built yet", () => {
    expect(placeholderCopy("Ad Tracking")).toBe("Ad Tracking is coming in a later phase.");
  });
});
