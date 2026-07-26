import { describe, expect, it } from "vitest";
import { COLD_CALL_PAGES, coldCallPagesFor, resolveColdCallView } from "./coldCallPages";

describe("coldCallPagesFor", () => {
  it("gives an owner every page, Settings included", () => {
    expect(coldCallPagesFor(true).map((p) => p.id)).toEqual([
      "leads",
      "callbacks",
      "booked",
      "pipelines",
      "tracker",
      "scoreboard",
      "settings",
    ]);
  });

  it("hides Settings from a cold caller", () => {
    const ids = coldCallPagesFor(false).map((p) => p.id);
    expect(ids).not.toContain("settings");
    expect(ids[0]).toBe("leads");
  });

  it("marks exactly one page owner-only", () => {
    expect(COLD_CALL_PAGES.filter((p) => p.ownerOnly).map((p) => p.id)).toEqual(["settings"]);
  });
});

describe("resolveColdCallView", () => {
  it("returns a known page", () => {
    expect(resolveColdCallView("callbacks", false)).toBe("callbacks");
    expect(resolveColdCallView("settings", true)).toBe("settings");
  });

  it("lands on Leads when the param is missing or nonsense", () => {
    expect(resolveColdCallView(null, false)).toBe("leads");
    expect(resolveColdCallView(undefined, true)).toBe("leads");
    expect(resolveColdCallView("", true)).toBe("leads");
    expect(resolveColdCallView("bogus", true)).toBe("leads");
  });

  it("sends a cold caller who types ?view=settings back to Leads", () => {
    // Hiding the tab is not the enforcement (the API is), but a typed URL must
    // not render a page the role cannot use.
    expect(resolveColdCallView("settings", false)).toBe("leads");
  });
});
