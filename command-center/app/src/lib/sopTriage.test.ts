import { describe, it, expect } from "vitest";
import { flagKey, buildGroups, selectedCount } from "./sopTriage";
import type { SopCategory, Sop } from "./sopData";

const sop = (slug: string, title: string, desc = ""): Sop => ({
  slug,
  title,
  emoji: "📄",
  desc,
  body: "",
});

const cat = (key: string, sops: Sop[]): SopCategory => ({
  key,
  name: key,
  emoji: "📁",
  sops,
});

const CATS: SopCategory[] = [
  cat("m1", [sop("a", "Campaign Prep"), sop("b", "Ad Approvals")]),
  cat("m2", [sop("c", "Triad Testing", "how testing works")]),
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

  it("filters by case-insensitive query across title and desc", () => {
    const groups = buildGroups(CATS, "TESTING", new Set(), false);
    expect(groups).toHaveLength(1);
    expect(groups[0].cat.key).toBe("m2");
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
});
