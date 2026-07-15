import { describe, it, expect } from "vitest";
import { sanitizeWebsitePages, toPageItems } from "./websitePages";

describe("sanitizeWebsitePages", () => {
  it("keeps well-formed rows and trims name/path", () => {
    const out = sanitizeWebsitePages([
      { name: "  Home ", path: " /home " },
      { name: "About", path: "/about" },
    ]);
    expect(out).toEqual([
      { name: "Home", path: "/home" },
      { name: "About", path: "/about" },
    ]);
  });

  it("forces a single leading slash on the path", () => {
    expect(sanitizeWebsitePages([{ name: "Services", path: "services" }])).toEqual([
      { name: "Services", path: "/services" },
    ]);
    // Already-slashed stays as-is (not doubled).
    expect(sanitizeWebsitePages([{ name: "Contact", path: "/contact" }])).toEqual([
      { name: "Contact", path: "/contact" },
    ]);
  });

  it("drops rows with an empty or blank name or path", () => {
    const out = sanitizeWebsitePages([
      { name: "", path: "/x" },
      { name: "  ", path: "/y" },
      { name: "Ok", path: "" },
      { name: "Ok", path: "   " },
      { name: "Real", path: "/real" },
    ]);
    expect(out).toEqual([{ name: "Real", path: "/real" }]);
  });

  it("caps name and path length", () => {
    const out = sanitizeWebsitePages([
      { name: "N".repeat(200), path: "/" + "p".repeat(400) },
    ]);
    expect(out[0].name.length).toBe(80);
    // 200 cap includes the leading slash.
    expect(out[0].path.length).toBe(200);
    expect(out[0].path.startsWith("/")).toBe(true);
  });

  it("caps the list to 50 rows", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ name: `P${i}`, path: `/p${i}` }));
    expect(sanitizeWebsitePages(many)).toHaveLength(50);
  });

  it("coerces non-array / junk / missing fields to an empty list", () => {
    expect(sanitizeWebsitePages(null)).toEqual([]);
    expect(sanitizeWebsitePages(undefined)).toEqual([]);
    expect(sanitizeWebsitePages("nope")).toEqual([]);
    expect(sanitizeWebsitePages({})).toEqual([]);
    expect(sanitizeWebsitePages([1, "x", null, { path: "/no-name" }])).toEqual([]);
  });
});

describe("toPageItems", () => {
  it("maps rows to wire items with id = path", () => {
    expect(
      toPageItems([
        { name: "Home", path: "/home" },
        { name: "About", path: "/about" },
      ]),
    ).toEqual([
      { id: "/home", name: "Home", path: "/home" },
      { id: "/about", name: "About", path: "/about" },
    ]);
  });
});
