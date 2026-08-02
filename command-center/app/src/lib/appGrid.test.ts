import { describe, it, expect } from "vitest";
import { NAV, bottomNavItems, flattenNav, type NavItem } from "./nav";
import { ACCOUNT_ROUTES, OTHER_LABEL, groupAppTiles } from "./appGrid";

// An owner sees every surface, which is the case that matters here: if a route
// is missing from the grid for an owner, it is missing for everybody.
const everything = flattenNav(NAV);
const routesOf = (groups: { items: NavItem[] }[]) =>
  groups.flatMap((g) => g.items.map((i) => i.to));

describe("the phone app grid", () => {
  it("gives every nav surface a tile", () => {
    // THE test. On a phone the grid is the only route to anything outside the
    // five-tab bottom bar, so a nav row missing here is a page with no way in.
    // That is exactly what had happened: the grid pointed at /sales/leads and
    // /sales/jobs, which had become redirects rather than nav rows, so the whole
    // "Sell & book" group rendered empty and four newer pages were never listed.
    const covered = new Set([...routesOf(groupAppTiles(everything)), ...ACCOUNT_ROUTES, "/apps"]);
    const missing = everything.map((i) => i.to).filter((to) => !covered.has(to));
    expect(missing).toEqual([]);
  });

  it("catches an ungrouped route in the More group rather than dropping it", () => {
    // The guarantee behind the test above: a new nav row added without touching
    // appGrid.ts still gets a tile.
    const invented = { to: "/brand-new", label: "Brand New", icon: {} } as unknown as NavItem;
    const groups = groupAppTiles([...everything, invented]);
    const other = groups.find((g) => g.label === OTHER_LABEL);
    expect(other?.items.map((i) => i.to)).toContain("/brand-new");
  });

  it("lists no route the nav does not have", () => {
    // The other half of the drift: a group naming a route that has since become
    // a redirect used to fail silently. It still cannot render a dead tile.
    const navRoutes = new Set(everything.map((i) => i.to));
    for (const to of routesOf(groupAppTiles(everything))) {
      expect(navRoutes.has(to)).toBe(true);
    }
  });

  it("does not tile the grid's own launcher", () => {
    expect(routesOf(groupAppTiles(everything))).not.toContain("/apps");
  });

  it("keeps Team out of the feature groups, for the Account block", () => {
    // Team is account administration. The page renders it beside Settings, the
    // way the desktop sidebar puts it in its footer rather than its nav column.
    expect(routesOf(groupAppTiles(everything))).not.toContain("/team");
    expect(ACCOUNT_ROUTES).toContain("/team");
  });

  it("drops a group whose every item is hidden, rather than showing a bare heading", () => {
    // A staff member without the inbox or contacts capability must not see an
    // empty "Run the business" section.
    const onlyAds = everything.filter((i) => i.to.startsWith("/marketing/paid-ads"));
    const labels = groupAppTiles(onlyAds).map((g) => g.label);
    expect(labels).toEqual(["Get customers"]);
  });

  it("reaches every surface the bottom bar dropped", () => {
    // Inbox and Chat are not on the bar. The grid is what stops that being the
    // same thing as removing them from the phone.
    const covered = new Set(routesOf(groupAppTiles(everything)));
    const bar = new Set(bottomNavItems(NAV).map((i) => i.to));
    for (const route of ["/conversations", "/comms"]) {
      expect(bar.has(route)).toBe(false);
      expect(covered.has(route)).toBe(true);
    }
  });
});
