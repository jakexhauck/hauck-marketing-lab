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
      "/apps",
      "/conversations",
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
      "/apps",
      "/conversations",
      "/contacts",
    ]);
    expect(bottom).not.toContain("/sales/leads");
  });

  it("keeps the agency chat off the phone bottom bar", () => {
    // Removed 2026-07-31: it was the far-right tab. The /comms route stays
    // registered so a bookmark resolves, but no chrome links to it.
    expect(
      flattenNav(NAV)
        .filter((i) => i.bottomNav)
        .map((i) => i.to),
    ).not.toContain("/comms");
  });

  it("centres the raised All features FAB in the bottom bar", () => {
    // BottomNav renders the bottomNav items in flatten order and raises /apps
    // into a FAB, so "centred" is purely a question of this list's ordering.
    // An odd tab count with /apps at the midpoint is the only arrangement that
    // puts it dead centre. Note this holds for an owner, who sees every tab; a
    // staff member missing the inbox or contacts capability sees a shorter bar.
    const bottom = flattenNav(NAV)
      .filter((i) => i.bottomNav)
      .map((i) => i.to);
    expect(bottom.length % 2).toBe(1);
    expect(bottom[(bottom.length - 1) / 2]).toBe("/apps");
  });
});
