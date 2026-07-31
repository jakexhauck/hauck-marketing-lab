import { describe, it, expect } from "vitest";
import { NAV, flattenNav, isNavSection } from "./nav";

describe("client nav structure", () => {
  it("is one flat list with no sections", () => {
    expect(NAV.filter(isNavSection)).toEqual([]);
  });

  it("has no expandable sub-groups in the sidebar", () => {
    for (const item of flattenNav(NAV)) {
      expect(item.children).toBeUndefined();
    }
  });

  it("shows only Paid Ads for marketing, back-burnered channels hidden", () => {
    const allRoutes = flattenNav(NAV).map((i) => i.to);
    expect(allRoutes.filter((r) => r.startsWith("/marketing/"))).toEqual([
      "/marketing/paid-ads",
    ]);
    expect(allRoutes).not.toContain("/marketing/social");
    expect(allRoutes).not.toContain("/marketing/outreach");
    expect(allRoutes).not.toContain("/marketing/groups");
    expect(allRoutes).not.toContain("/marketing/website");
    expect(allRoutes).not.toContain("/marketing/reviews");
    expect(allRoutes).not.toContain("/marketing/reactivation");
  });

  it("keeps the flat sidebar order: Home, Ads, then the company surfaces", () => {
    expect(flattenNav(NAV).map((i) => i.to)).toEqual([
      "/home",
      "/sales",
      "/marketing/paid-ads",
      "/conversations",
      "/apps",
      "/contacts",
      "/team",
      "/comms",
    ]);
  });

  it("does not link Customers: the row was retired from the nav", () => {
    // Like /billing, the routes stay registered so a bookmark and Close Out
    // Job's post-save redirect still work, but no surface may point at it.
    expect(flattenNav(NAV).map((i) => i.to)).not.toContain("/customers");
  });

  it("does not link Revenue: customer revenue lives on the Customers page", () => {
    // The /billing route stays registered so an existing bookmark does not 404,
    // but no surface may point at it any more. See lib/nav.ts.
    expect(flattenNav(NAV).map((i) => i.to)).not.toContain("/billing");
  });

  it("has no duplicate leaf routes", () => {
    const routes = flattenNav(NAV).map((i) => i.to);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("has the Direction B bottom bar in order, with Leads off it", () => {
    const bottom = flattenNav(NAV)
      .filter((i) => i.bottomNav)
      .map((i) => i.to);
    expect(bottom).toEqual([
      "/home",
      "/sales",
      "/conversations",
      "/apps",
      "/contacts",
      "/comms",
    ]);
    expect(bottom).not.toContain("/sales/leads");
  });
});
