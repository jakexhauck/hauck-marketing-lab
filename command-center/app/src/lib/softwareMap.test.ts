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

// Does a concrete path match a route pattern, allowing for :params?
function matchesRoute(path: string, route: string): boolean {
  const p = path.split("?")[0].split("/").filter(Boolean);
  const r = route.split("/").filter(Boolean);
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

  it("expands in-page tabs as children of their parent page", () => {
    const metaData = pages.find((p) => p.path === "/marketing/paid-ads/meta");
    expect(metaData?.child).toBe(true);
    // The parent's own row is not a child, and is listed exactly once.
    expect(pages.filter((p) => p.path === "/marketing/paid-ads")).toHaveLength(1);
    expect(pages.find((p) => p.path === "/marketing/paid-ads")?.child).toBeUndefined();
  });

  it("lists the Jobs calendar views, which are not routes", () => {
    const labels = pages.filter((p) => p.path.startsWith("/sales?")).map((p) => p.label);
    expect(labels).toEqual(["Jobs", "Month", "Week", "Agenda"]);
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
    const home = pages.find((p) => p.path === "/home") as SoftwarePage;
    expect(resolveRecordPath(home, {})).toBe("/home");
  });
});
