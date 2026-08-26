import { describe, expect, it } from "vitest";
import { REGIONS, REGION_STATES, regionOf, type Region } from "./usRegions";
import { US_STATE_SHAPES } from "./usStatePaths";

describe("usRegions", () => {
  // The map draws its shapes from usStatePaths and colours them from here. If
  // the two lists ever disagree a state renders with no fill and no explanation,
  // so they are checked against each other rather than against a hand-typed
  // count.
  it("covers every shape the map can draw, exactly once", () => {
    const shapes = US_STATE_SHAPES.map((s) => s.code).sort();
    const bucketed = REGIONS.flatMap((r) => REGION_STATES[r]).sort();
    expect(bucketed).toEqual(shapes);
  });

  it("puts no state in two blocks", () => {
    const seen = new Set<string>();
    for (const region of REGIONS) {
      for (const code of REGION_STATES[region]) {
        expect(seen.has(code), `${code} is in more than one block`).toBe(false);
        seen.add(code);
      }
    }
    expect(seen.size).toBe(51);
  });

  it("agrees with its own tables", () => {
    for (const region of REGIONS) {
      for (const code of REGION_STATES[region]) {
        expect(regionOf(code)).toBe(region);
      }
    }
  });

  it("folds the Mountain states into the West, as chosen", () => {
    for (const code of ["AZ", "CO", "UT", "NV", "NM", "ID", "MT", "WY"]) {
      expect(regionOf(code)).toBe<Region>("west");
    }
    for (const code of ["CA", "OR", "WA"]) {
      expect(regionOf(code)).toBe<Region>("west");
    }
  });

  it("assigns the two split states by where their people are", () => {
    expect(regionOf("TN")).toBe<Region>("central");
    expect(regionOf("KY")).toBe<Region>("east");
  });

  it("reads a code however it is written", () => {
    expect(regionOf("ca")).toBe<Region>("west");
    expect(regionOf(" Tx ")).toBe<Region>("central");
  });

  // A territory painted Central would be a claim about when it can be rung.
  it("returns null rather than guessing", () => {
    expect(regionOf("PR")).toBeNull();
    expect(regionOf("GU")).toBeNull();
    expect(regionOf("")).toBeNull();
    expect(regionOf(null)).toBeNull();
    expect(regionOf(undefined)).toBeNull();
  });
});
