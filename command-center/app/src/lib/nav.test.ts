import { describe, it, expect } from "vitest";
import { NAV, flattenNav, isNavSection } from "./nav";

describe("client nav structure", () => {
  it("has exactly two sections: Marketing then Company", () => {
    const sections = NAV.filter(isNavSection);
    expect(sections.map((s) => s.id)).toEqual(["marketing", "company"]);
  });

  it("keeps Marketing flat (no expandable sub-groups in the sidebar)", () => {
    const marketing = NAV.filter(isNavSection).find((s) => s.id === "marketing")!;
    for (const item of marketing.items) {
      expect(item.children).toBeUndefined();
    }
  });

  it("shows exactly the four sold services in Marketing, back-burnered ones hidden", () => {
    const marketing = NAV.filter(isNavSection).find((s) => s.id === "marketing")!;
    expect(marketing.items.map((i) => i.to)).toEqual([
      "/marketing/paid-ads",
      "/marketing/website",
      "/marketing/reviews",
      "/marketing/reactivation",
    ]);
    const allRoutes = flattenNav(NAV).map((i) => i.to);
    expect(allRoutes).not.toContain("/marketing/social");
    expect(allRoutes).not.toContain("/marketing/outreach");
    expect(allRoutes).not.toContain("/marketing/groups");
  });

  it("folds the sales surfaces into Company", () => {
    const company = NAV.filter(isNavSection).find((s) => s.id === "company")!;
    const routes = company.items.map((i) => i.to);
    expect(routes).toEqual(
      expect.arrayContaining(["/sales/leads", "/sales/jobs", "/billing"]),
    );
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
      "/conversations",
      "/apps",
      "/contacts",
      "/comms",
    ]);
    expect(bottom).not.toContain("/sales/leads");
  });
});
