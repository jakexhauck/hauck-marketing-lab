import { describe, expect, it } from "vitest";
import { COLD_CALL_PAGES, coldCallPagesFor, coldCallSides, resolveColdCallView } from "./coldCallPages";

describe("coldCallPagesFor", () => {
  it("gives an owner the dialer, the tracker and the scripts", () => {
    expect(coldCallPagesFor(true).map((p) => p.id)).toEqual(["dialing", "tracker", "scripts"]);
  });

  it("gives a caller the dialer and the tracker", () => {
    expect(coldCallPagesFor(false).map((p) => p.id)).toEqual(["dialing", "tracker"]);
  });

  it("has no Management, Pipeline, Availability or SOPs page", () => {
    const ids = COLD_CALL_PAGES.map((p) => p.id);
    for (const gone of ["management", "pipeline", "availability", "sops", "assign", "settings"]) {
      expect(ids).not.toContain(gone);
    }
  });
});

describe("coldCallSides", () => {
  it("puts scripts on the owner side", () => {
    const { left, right } = coldCallSides(true);
    expect(left.map((p) => p.id)).toEqual(["dialing", "tracker"]);
    expect(right.map((p) => p.id)).toEqual(["scripts"]);
  });

  it("gives a caller no right-hand group", () => {
    expect(coldCallSides(false).right).toEqual([]);
  });
});

describe("resolveColdCallView", () => {
  it("resolves a page the role can see", () => {
    expect(resolveColdCallView("tracker", false)).toBe("tracker");
    expect(resolveColdCallView("scripts", true)).toBe("scripts");
  });

  it("keeps scripts from a caller", () => {
    expect(resolveColdCallView("scripts", false)).toBe("dialing");
  });

  it("sends an owner's old scripts links to Scripts", () => {
    expect(resolveColdCallView("management", true, "scripts")).toBe("scripts");
    expect(resolveColdCallView("management", true, "assets")).toBe("scripts");
    expect(resolveColdCallView("settings", true)).toBe("scripts");
  });

  it("drops cut pages onto the power dialer", () => {
    for (const gone of ["pipeline", "availability", "sops", "assign", "first-dial"]) {
      expect(resolveColdCallView(gone, true)).toBe("dialing");
    }
    expect(resolveColdCallView("management", true, "stages")).toBe("dialing");
    expect(resolveColdCallView(null, false)).toBe("dialing");
  });
});
