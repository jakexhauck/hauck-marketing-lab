import { describe, it, expect } from "vitest";
import {
  CALL_ZONES,
  ZONE_BY_AREA_CODE,
  areaCodeOf,
  areaCodesForZone,
  isCallZone,
} from "./leadZones";

describe("areaCodeOf", () => {
  it("reads the code off a stored number", () => {
    expect(areaCodeOf("+12065551234")).toBe("206");
    expect(areaCodeOf("(206) 555-1234")).toBe("206");
    expect(areaCodeOf("206.555.1234")).toBe("206");
  });

  it("says nothing rather than guessing at a number it cannot read", () => {
    expect(areaCodeOf("555-1234")).toBe("");
    expect(areaCodeOf("")).toBe("");
    // An area code never starts with 0 or 1.
    expect(areaCodeOf("+11065551234")).toBe("");
  });
});

describe("areaCodesForZone", () => {
  // The filter's whole contract: a zone becomes the exact set of codes the
  // clock on the call card would put in that zone. If these two ever came apart,
  // a lead could be filtered into Pacific and then show an Eastern time.
  it("agrees with the map the call card reads", () => {
    for (const { zone } of CALL_ZONES) {
      for (const code of areaCodesForZone(zone)) {
        expect(ZONE_BY_AREA_CODE[code]).toBe(zone);
      }
    }
  });

  it("puts the obvious ones where they belong", () => {
    expect(areaCodesForZone("America/Los_Angeles")).toContain("206");
    expect(areaCodesForZone("America/New_York")).toContain("212");
    expect(areaCodesForZone("America/Chicago")).toContain("312");
    expect(areaCodesForZone("America/Denver")).toContain("303");
  });

  // Arizona does not move for daylight saving, so folding it into Mountain would
  // put a Phoenix number an hour out for most of the year.
  it("keeps Arizona out of Mountain", () => {
    expect(areaCodesForZone("America/Denver")).not.toContain("602");
    expect(areaCodesForZone("America/Phoenix")).toContain("602");
  });

  it("is empty for a zone nobody offers, rather than throwing", () => {
    expect(areaCodesForZone("Europe/London")).toEqual([]);
  });

  it("never hands back an empty list for a zone the filter offers", () => {
    for (const { zone } of CALL_ZONES) expect(areaCodesForZone(zone).length).toBeGreaterThan(0);
  });
});

describe("isCallZone", () => {
  it("accepts only the four the filter offers", () => {
    expect(isCallZone("America/Los_Angeles")).toBe(true);
    expect(isCallZone("America/Chicago")).toBe(true);
    // A real zone, but not one the picker can produce.
    expect(isCallZone("Pacific/Honolulu")).toBe(false);
  });

  // The endpoint turns this into an IN list. An unknown zone waved through would
  // build an empty one, which reads on screen as "there are no leads".
  it("refuses anything else", () => {
    expect(isCallZone("Pacific")).toBe(false);
    expect(isCallZone("")).toBe(false);
    expect(isCallZone(null)).toBe(false);
    expect(isCallZone(undefined)).toBe(false);
  });
});
