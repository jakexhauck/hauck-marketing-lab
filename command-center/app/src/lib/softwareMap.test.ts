import { describe, expect, it } from "vitest";
// The router's own source, so this test tracks the real routes rather than a
// copy of them that could drift.
import appSource from "../App.tsx?raw";
import {
  allSoftwarePages,
  buildSoftwareMap,
  navPaths,
  resolveRecordPath,
  type SoftwarePage,
} from "./softwareMap";

// The Software tab's whole promise is "every page, always current". These tests
// are what keep that true: the inventory must cover the real nav, and every path
// in it must be a route the router actually serves.

const map = buildSoftwareMap();
const pages = allSoftwarePages(map);

// Route paths registered in App.tsx, e.g. "/marketing/paid-ads/media" and
// "/contacts/:contactId".
function registeredRoutes(): string[] {
  return [...appSource.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
}

// Does a concrete path match a route pattern, allowing for :params and a
// trailing splat?
//
// The splat matters: /sales/* serves /sales AND /sales/schedule, and this helper
// predates the app having one, so it reported both as pointing at a route the
// router does not serve.
function matchesRoute(path: string, route: string): boolean {
  const p = path.split("?")[0].split("/").filter(Boolean);
  const r = route.split("/").filter(Boolean);

  if (r[r.length - 1] === "*") {
    // A splat matches its own prefix and anything below it, so the concrete
    // path must be at least as long as the segments before the star.
    const prefix = r.slice(0, -1);
    if (p.length < prefix.length) return false;
    return prefix.every((seg, i) => seg.startsWith(":") || seg === p[i]);
  }

  if (p.length !== r.length) return false;
  return r.every((seg, i) => seg.startsWith(":") || seg === p[i]);
}

describe("software map coverage", () => {
  it("includes every sidebar row from nav.ts", () => {
    const paths = new Set(pages.map((p) => p.path));
    for (const nav of navPaths()) {
      expect(paths.has(nav), `nav row ${nav} is missing from the Software tab`).toBe(true);
    }
  });

  it("has no duplicate entries", () => {
    const ids = pages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every page a non-empty label", () => {
    for (const p of pages) expect(p.label.trim()).not.toBe("");
  });

  it("points every page at a route the router serves", () => {
    const routes = registeredRoutes();
    const orphans = pages.filter((p) => !routes.some((r) => matchesRoute(p.path, r)));
    expect(orphans.map((o) => o.path)).toEqual([]);
  });

  it("expands a page's in-place views as children of it", () => {
    // The Jobs calendar's four views are component state rather than routes, so
    // they are the remaining example of this mechanism.
    const month = pages.find((p) => p.path === "/sales/schedule?view=month");
    expect(month?.child).toBe(true);
    // The parent's own row is not a child, and is listed exactly once.
    expect(pages.filter((p) => p.path === "/sales/schedule")).toHaveLength(1);
    expect(pages.find((p) => p.path === "/sales/schedule")?.child).toBeUndefined();
  });

  it("files the calendar views under Schedule, not under Leads", () => {
    // They were children of /sales while Schedule was a tab of it. Now that
    // Schedule is its own sidebar row, leaving them behind would file the
    // calendar's views under the leads board.
    const views = pages.filter((p) => p.path.startsWith("/sales/schedule?"));
    expect(views.map((v) => v.label)).toEqual(["Jobs", "Month", "Week", "Agenda"]);
    expect(pages.filter((p) => p.path.startsWith("/sales?"))).toEqual([]);
  });

  it("lists a page promoted to the sidebar once, and not as somebody's child", () => {
    // Paid Ads and Sales lost their in-page tab bars when their pages became
    // sidebar rows. Leaving them in TABS_BY_PARENT would have entered each page
    // twice: once as its own row and once as a child of the row it used to sit
    // under.
    for (const path of [
      "/marketing/paid-ads",
      "/marketing/paid-ads/leads",
      "/marketing/paid-ads/meta",
      "/sales",
      "/sales/schedule",
    ]) {
      const hits = pages.filter((p) => p.path === path);
      expect(hits, `${path} should appear exactly once`).toHaveLength(1);
      expect(hits[0].child, `${path} is a sidebar row, not a child`).toBeUndefined();
    }
  });



  it("groups pages, leading with Main and trailing with record pages", () => {
    // The nav is currently one flat list (no sections), so every sidebar row
    // lands in Main and the only other group is the record pages.
    expect(map[0].id).toBe("main");
    expect(map[map.length - 1].id).toBe("records");
    expect(map.map((g) => g.id)).toEqual(["main", "records"]);
  });
});

describe("record paths", () => {
  const leadPage = pages.find((p) => p.needsRecord === "lead") as SoftwarePage;

  it("substitutes a real id", () => {
    expect(resolveRecordPath(leadPage, { lead: "abc123" })).toBe("/lead/abc123");
  });

  it("encodes an id that needs it", () => {
    expect(resolveRecordPath(leadPage, { lead: "a b/c" })).toBe("/lead/a%20b%2Fc");
  });

  it("returns null when the client has no such record, rather than a broken path", () => {
    expect(resolveRecordPath(leadPage, { lead: null })).toBeNull();
    expect(resolveRecordPath(leadPage, {})).toBeNull();
  });

  it("leaves ordinary pages untouched", () => {
    // The landing page, which is the Lead Tracker since Home was retired.
    const landing = pages.find(
      (p) => p.path === "/marketing/paid-ads/leads",
    ) as SoftwarePage;
    expect(landing).toBeDefined();
    expect(resolveRecordPath(landing, {})).toBe("/marketing/paid-ads/leads");
  });
});
