import { describe, it, expect } from "vitest";
import {
  CLIENT_HOME,
  NAV,
  bottomNavItems,
  filterNav,
  flattenNav,
  isNavSection,
  needsExactMatch,
} from "./nav";

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
      "/organic",
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
    const bottom = bottomNavItems(NAV).map((i) => i.to);
    expect(bottom).toEqual([
      "/marketing/paid-ads/leads",
      "/marketing/paid-ads",
      "/apps",
      "/sales",
      "/contacts",
    ]);
    expect(bottom).not.toContain("/home");
  });

  it("orders the bar by slot, not by position in the nav list", () => {
    // The point of the slot. Ads Dashboard sits SECOND in the bar while being
    // second in the rail too, but Sales sits fifth in the rail and fourth in the
    // bar: the two orders are now free to differ. Under the old boolean the bar
    // took nav-list order, so moving a sidebar row silently moved a phone tab.
    const slots = bottomNavItems(NAV).map((i) => i.bottomNav);
    expect(slots).toEqual([...slots].sort((a, b) => a! - b!));
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("keeps the bottom bar at five, so the raised All button stays centred", () => {
    // The bar sorts by slot and the FAB is whichever sits third. Splitting Sales
    // into two rows and Paid Ads into four could easily have added five more
    // tabs and pushed the FAB off centre, so only Lead Tracker and Ads Dashboard
    // take ad slots and Schedule takes none.
    const bottom = bottomNavItems(NAV);
    expect(bottom).toHaveLength(5);
    expect(bottom[2].to).toBe("/apps");
    expect(bottom.map((i) => i.to)).not.toContain("/sales/schedule");
    expect(bottom.map((i) => i.to)).not.toContain("/marketing/paid-ads/meta");
    expect(bottom.map((i) => i.to)).not.toContain("/marketing/paid-ads/creatives");
  });

  it("keeps the agency chat and the inbox off the phone bottom bar", () => {
    // Chat removed 2026-07-31 (it was the far-right tab); Inbox removed
    // 2026-08-02, its slot taken by Ads Dashboard. Both routes stay registered
    // and both are on the /apps grid, so neither is unreachable on a phone.
    const bottom = bottomNavItems(NAV).map((i) => i.to);
    expect(bottom).not.toContain("/comms");
    expect(bottom).not.toContain("/conversations");
  });

  it("centres the raised All features FAB in the bottom bar", () => {
    // BottomNav renders the bar in slot order and raises /apps into a FAB, so
    // "centred" is purely a question of the slots. An odd tab count with /apps
    // at the midpoint is the only arrangement that puts it dead centre. Note
    // this holds for an owner, who sees every tab; a staff member missing the
    // contacts capability sees a shorter bar.
    const bottom = bottomNavItems(NAV).map((i) => i.to);
    expect(bottom.length % 2).toBe(1);
    expect(bottom[(bottom.length - 1) / 2]).toBe("/apps");
  });

  it("puts the Ads Dashboard on the bar without stranding the Lead Tracker", () => {
    // Both live under /marketing/paid-ads, and the Ads tab is the PREFIX of the
    // Lead Tracker tab's route. BottomNav's active test has to special-case
    // that, or opening the Lead Tracker lights two tabs at once.
    const bottom = bottomNavItems(NAV).map((i) => i.to);
    const nested = bottom.filter(
      (to) => to !== "/marketing/paid-ads" && to.startsWith("/marketing/paid-ads/"),
    );
    expect(nested).toEqual(["/marketing/paid-ads/leads"]);
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
    expect(bottomNavItems(NAV).map((i) => i.to)).toContain(CLIENT_HOME);
  });

  it("is the bar's first tab, so the app opens on the tab it lands on", () => {
    expect(bottomNavItems(NAV)[0].to).toBe(CLIENT_HOME);
  });
});

describe("data-gated surfaces", () => {
  const owner = { isOwner: true, can: () => true };

  it("hides Organic when the client has no Organic pipeline", () => {
    const routes = filterNav(flattenNav(NAV), { ...owner, hasData: () => false }).map(
      (i) => i.to,
    );
    expect(routes).not.toContain("/organic");
  });

  it("shows Organic when the client has one", () => {
    const routes = filterNav(flattenNav(NAV), {
      ...owner,
      hasData: (g) => g === "organic",
    }).map((i) => i.to);
    expect(routes).toContain("/organic");
  });

  // The gate defaults CLOSED. A caller that forgets to pass hasData must not
  // leak a surface, and the probe answering slowly must not flash the row in and
  // then take it away.
  it("hides a gated row when the caller supplies no gate at all", () => {
    expect(filterNav(flattenNav(NAV), owner).map((i) => i.to)).not.toContain("/organic");
  });

  // Being the owner is not the question: an owner whose client has no Organic
  // pipeline has no Organic page either.
  it("gates owners too", () => {
    const routes = filterNav(flattenNav(NAV), {
      isOwner: true,
      can: () => true,
      hasData: () => false,
    }).map((i) => i.to);
    expect(routes).not.toContain("/organic");
  });

  it("leaves ungated rows alone", () => {
    const routes = filterNav(flattenNav(NAV), { ...owner, hasData: () => false }).map(
      (i) => i.to,
    );
    expect(routes).toContain(CLIENT_HOME);
  });
});
