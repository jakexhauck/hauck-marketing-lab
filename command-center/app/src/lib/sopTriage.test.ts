import { describe, it, expect } from "vitest";
import { flagKey, buildGroups, selectedCount } from "./sopTriage";
import type { SopCategory, SopEntry } from "./sopHub";

const sop = (slug: string, title: string): SopEntry => ({
  slug,
  title,
  fileId: `file-${slug}`,
  videoId: null,
  webViewLink: null,
  modifiedTime: null,
});

const cat = (key: string, name: string, sops: SopEntry[]): SopCategory => ({
  key,
  name,
  sops,
  attachments: [],
});

const CATS: SopCategory[] = [
  cat("m1", "Facebook Ads", [sop("a", "Campaign Prep"), sop("b", "Ad Approvals")]),
  cat("m2", "Sales", [sop("c", "Triad Testing")]),
];

describe("flagKey", () => {
  it("joins category key and slug", () => {
    expect(flagKey("m1", "a")).toBe("m1/a");
  });
});

describe("selectedCount", () => {
  it("counts considered SOPs in a category by flag key", () => {
    const considered = new Set(["m1/a"]);
    expect(selectedCount(CATS[0], considered)).toBe(1);
    expect(selectedCount(CATS[1], considered)).toBe(0);
  });
});

describe("buildGroups", () => {
  it("returns all categories when no query and not selected-only", () => {
    const groups = buildGroups(CATS, "", new Set(), false);
    expect(groups.map((g) => g.cat.key)).toEqual(["m1", "m2"]);
    expect(groups[0].sops).toHaveLength(2);
  });

  it("filters by case-insensitive query on the SOP title", () => {
    const groups = buildGroups(CATS, "TESTING", new Set(), false);
    expect(groups).toHaveLength(1);
    expect(groups[0].cat.key).toBe("m2");
  });

  it("matching a category name keeps that whole category", () => {
    const groups = buildGroups(CATS, "facebook", new Set(), false);
    expect(groups).toHaveLength(1);
    expect(groups[0].sops).toHaveLength(2);
  });

  it("with selectedOnly, keeps only considered SOPs and drops empty categories", () => {
    const considered = new Set(["m1/b"]);
    const groups = buildGroups(CATS, "", considered, true);
    expect(groups).toHaveLength(1);
    expect(groups[0].cat.key).toBe("m1");
    expect(groups[0].sops.map((s) => s.slug)).toEqual(["b"]);
  });

  it("applies query and selectedOnly together", () => {
    const considered = new Set(["m1/a", "m2/c"]);
    const groups = buildGroups(CATS, "campaign", considered, true);
    expect(groups).toHaveLength(1);
    expect(groups[0].sops.map((s) => s.slug)).toEqual(["a"]);
  });

  it("returns nothing when the query matches neither category nor SOP", () => {
    expect(buildGroups(CATS, "nonexistent", new Set(), false)).toEqual([]);
  });
});
