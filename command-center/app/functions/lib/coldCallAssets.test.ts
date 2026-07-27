import { describe, it, expect } from "vitest";
import {
  MAX_CATEGORY,
  MAX_NAME,
  MIN_DIALS_FOR_RATE,
  cleanCategory,
  cleanName,
  groupByCategory,
  isAssetKind,
  leadingScript,
  sameCategory,
  statsByScript,
  type ScriptDialRow,
} from "./coldCallAssets";

function dials(scriptId: string | null, spec: Record<string, number>): ScriptDialRow[] {
  const out: ScriptDialRow[] = [];
  for (const [outcome, n] of Object.entries(spec)) {
    for (let i = 0; i < n; i++) out.push({ script_id: scriptId, outcome });
  }
  return out;
}

describe("kinds", () => {
  it("knows the two, and nothing else", () => {
    expect(isAssetKind("script")).toBe(true);
    expect(isAssetKind("asset")).toBe(true);
    expect(isAssetKind("objection")).toBe(false);
    expect(isAssetKind(null)).toBe(false);
  });
});

describe("cleanName and cleanCategory", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanName("  Pattern   interrupt  ")).toBe("Pattern interrupt");
    expect(cleanCategory("  Objection\n handling ")).toBe("Objection handling");
  });

  it("refuses anything unusable as a name", () => {
    expect(cleanName("")).toBe("");
    expect(cleanName("   ")).toBe("");
    expect(cleanName(null)).toBe("");
    expect(cleanName(42)).toBe("");
  });

  it("caps the length rather than rejecting a long name outright", () => {
    expect(cleanName("x".repeat(500))).toHaveLength(MAX_NAME);
    expect(cleanCategory("y".repeat(500))).toHaveLength(MAX_CATEGORY);
  });

  // Two headings that look identical in a list must BE identical.
  it("treats headings differing only in case or spacing as one", () => {
    expect(sameCategory("Objection Handling", "objection handling  ")).toBe(true);
    expect(sameCategory("Voicemail", "Objections")).toBe(false);
  });
});

describe("statsByScript", () => {
  it("counts dials, pickups and bookings per script", () => {
    const stats = statsByScript([
      ...dials("v1", { no_answer: 20, brush_off: 5, booked: 5 }),
      ...dials("v2", { no_answer: 10 }),
    ]);
    expect(stats.v1.dials).toBe(30);
    // brush_off and booked both spoke; no_answer did not.
    expect(stats.v1.pickups).toBe(10);
    expect(stats.v1.booked).toBe(5);
    expect(stats.v2).toEqual({ dials: 10, pickups: 0, booked: 0, bookingRate: null });
  });

  it("ignores dials that name no script", () => {
    const stats = statsByScript(dials(null, { booked: 5 }));
    expect(Object.keys(stats)).toEqual([]);
  });

  // The rule the floor exists for. Jake picks the script rather than the app
  // rotating it, so small samples are guaranteed and 1-in-4 must not read as 25%.
  it("withholds the rate below the floor and reports it above", () => {
    const thin = statsByScript(dials("v1", { no_answer: 3, booked: 1 }));
    expect(thin.v1.dials).toBe(4);
    expect(thin.v1.booked).toBe(1);
    expect(thin.v1.bookingRate).toBeNull();

    const thick = statsByScript(dials("v2", { no_answer: 45, booked: 5 }));
    expect(thick.v2.dials).toBe(50);
    expect(thick.v2.bookingRate).toBeCloseTo(0.1);
  });

  it("reports a rate at exactly the floor", () => {
    const stats = statsByScript(dials("v1", { no_answer: MIN_DIALS_FOR_RATE }));
    expect(stats.v1.bookingRate).toBe(0);
  });

  // An outcome the app does not know still happened; it is a dial and no more.
  it("counts an unknown outcome as a dial and guesses nothing else", () => {
    const stats = statsByScript(dials("v1", { something_new: 4 }));
    expect(stats.v1).toMatchObject({ dials: 4, pickups: 0, booked: 0 });
  });
});

describe("leadingScript", () => {
  const measured = (booked: number, total: number) =>
    dials("x", { booked, no_answer: total - booked });

  it("names the best of several measured variations", () => {
    const stats = statsByScript([
      ...measured(2, 50).map((d) => ({ ...d, script_id: "v1" })),
      ...measured(10, 50).map((d) => ({ ...d, script_id: "v2" })),
    ]);
    expect(leadingScript(stats)?.id).toBe("v2");
  });

  it("names no leader when only one variation is past the floor", () => {
    const stats = statsByScript([
      ...measured(10, 50).map((d) => ({ ...d, script_id: "v1" })),
      ...dials("v2", { booked: 2 }),
    ]);
    expect(leadingScript(stats)).toBeNull();
  });

  it("names no leader on a tie, rather than tossing a coin", () => {
    const stats = statsByScript([
      ...measured(5, 50).map((d) => ({ ...d, script_id: "v1" })),
      ...measured(5, 50).map((d) => ({ ...d, script_id: "v2" })),
    ]);
    expect(leadingScript(stats)).toBeNull();
  });

  it("has nothing to say about an empty test", () => {
    expect(leadingScript({})).toBeNull();
  });
});

describe("groupByCategory", () => {
  const asset = (category: string, sortOrder: number) => ({ category, sortOrder });

  it("groups headings that differ only in case or spacing", () => {
    const groups = groupByCategory([
      asset("Objection handling", 0),
      asset("objection  handling", 1),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
    // The first spelling seen is the one shown.
    expect(groups[0].category).toBe("Objection handling");
  });

  it("orders sections by their topmost document, not alphabetically", () => {
    const groups = groupByCategory([
      asset("Voicemail", 5),
      asset("Objections", 1),
      asset("Voicemail", 0),
    ]);
    expect(groups.map((g) => g.category)).toEqual(["Voicemail", "Objections"]);
  });

  it("gives a document with no heading somewhere to live", () => {
    const groups = groupByCategory([asset("", 0), asset("   ", 1)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("Uncategorised");
  });

  it("has nothing to group from an empty shelf", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
