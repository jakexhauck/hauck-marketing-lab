import { describe, it, expect } from "vitest";
import { CLIENT_HOME, NAV, flattenNav, isNavSection, needsExactMatch } from "./nav";

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
    // Three rows rather than one since the in-page tab bar became sidebar rows,
    // but still only Paid Ads: no other channel is back.
    expect(allRoutes.filter((r) => r.startsWith("/marketing/"))).toEqual([
      "/marketing/paid-ads/leads",
      "/marketing/paid-ads",
      "/marketing/paid-ads/meta",
      "/marketing/paid-ads/creatives",
    ]);
    expect(allRoutes).not.toContain("/marketing/social");
    expect(allRoutes).not.toContain("/marketing/outreach");
    expect(allRoutes).not.toContain("/marketing/groups");
    expect(allRoutes).not.toContain("/marketing/website");
    expect(allRoutes).not.toContain("/marketing/reviews");
    expect(allRoutes).not.toContain("/marketing/reactivation");
  });

  it("opens on the Lead Tracker, with Ads leading the rail", () => {
    expect(flattenNav(NAV).map((i) => i.to)).toEqual([
      "/marketing/paid-ads/leads",
      "/marketing/paid-ads",
      "/marketing/paid-ads/meta",
      "/marketing/paid-ads/creatives",
      "/sales",
      "/sales/schedule",
      "/apps",
      "/conversations",
      "/contacts",
      "/team",
      "/comms",
    ]);
  });

  it("does not link Home: the row was retired 2026-08-01", () => {
    // Like /billing and /customers, the route stays registered so a bookmark
    // and the product tour still resolve, but no chrome points at it.
    expect(flattenNav(NAV).map((i) => i.to)).not.toContain("/home");
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

  it("has the bottom bar in order, opening on the Lead Tracker", () => {
    const bottom = flattenNav(NAV)
      .filter((i) => i.bottomNav)
      .map((i) => i.to);
    expect(bottom).toEqual([
      "/marketing/paid-ads/leads",
      "/sales",
      "/apps",
      "/conversations",
      "/contacts",
    ]);
    expect(bottom).not.toContain("/home");
  });

  it("keeps the bottom bar at five, so the raised All button stays centred", () => {
    // The bar renders bottomNav items in flatten order and the FAB is whichever
    // sits third. Splitting Sales into two rows and Paid Ads into three could
    // easily have added four more tabs and pushed the FAB off centre, so only
    // Leads keeps bottomNav and the ads pages take none.
    // Retiring Home is why Lead Tracker took a bottomNav slot: without it the
    // bar drops to four and the raised button is no longer in the middle.
    const bottom = flattenNav(NAV).filter((i) => i.bottomNav);
    expect(bottom).toHaveLength(5);
    expect(bottom[2].to).toBe("/apps");
    expect(bottom.map((i) => i.to)).not.toContain("/sales/schedule");
    expect(bottom.map((i) => i.to)).not.toContain("/marketing/paid-ads/meta");
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

describe("sidebar highlighting", () => {
  const rows = flattenNav(NAV);
  const row = (to: string) => rows.find((i) => i.to === to)!;

  it("makes a row exact when another row sits underneath it", () => {
    // NavLink prefix-matches by default, so without this /sales/schedule lights
    // up Leads AND Schedule, and /marketing/paid-ads/meta lights up Ads
    // Dashboard AND Meta Data.
    expect(needsExactMatch(row("/sales"), rows)).toBe(true);
    expect(needsExactMatch(row("/marketing/paid-ads"), rows)).toBe(true);
  });

  it("leaves a leaf row on prefix matching", () => {
    // A leaf has nothing below it, so an exact match would only stop it staying
    // lit on its own deeper pages.
    expect(needsExactMatch(row("/sales/schedule"), rows)).toBe(false);
    expect(needsExactMatch(row("/marketing/paid-ads/meta"), rows)).toBe(false);
    expect(needsExactMatch(row("/contacts"), rows)).toBe(false);
  });

  it("does not treat a shared name prefix as nesting", () => {
    // "/sales" must not be considered the parent of a hypothetical "/salesfoo".
    const fake = [{ to: "/sales", label: "Leads" }, { to: "/salesfoo", label: "Other" }] as never;
    expect(needsExactMatch({ to: "/sales", label: "Leads" } as never, fake)).toBe(false);
  });
});

describe("the landing page", () => {
  it("is a row the sidebar actually shows", () => {
    // The failure this catches: Home was taken out of the nav while Login still
    // sent people to it, so signing in landed on a page with no row, reachable
    // only by the thing that had just sent you there.
    expect(flattenNav(NAV).map((i) => i.to)).toContain(CLIENT_HOME);
  });

  it("is the first row, so the app opens where the rail starts", () => {
    expect(flattenNav(NAV)[0].to).toBe(CLIENT_HOME);
  });

  it("is on the phone bottom bar too", () => {
    expect(
      flattenNav(NAV).filter((i) => i.bottomNav).map((i) => i.to),
    ).toContain(CLIENT_HOME);
  });
});
