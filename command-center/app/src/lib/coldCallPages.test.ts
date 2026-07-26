import { describe, expect, it } from "vitest";
import { COLD_CALL_PAGES, coldCallPagesFor, resolveColdCallView } from "./coldCallPages";
import { COLD_CALL_STAGES } from "./coldCallStages";

describe("coldCallPagesFor", () => {
  it("is the pipeline, in order, then the three pages that are not stages", () => {
    expect(coldCallPagesFor(true).map((p) => p.id)).toEqual([
      "new-lead",
      "first-dial",
      "second-dial",
      "call-back",
      "booked",
      "not-interested",
      "book",
      "tracker",
      "scoreboard",
      "settings",
    ]);
  });

  it("gives every stage a page, and none of them is owner-only", () => {
    // A caller works the stages; hiding one would hide part of his own job.
    const callerPages = coldCallPagesFor(false).map((p) => p.id);
    for (const stage of COLD_CALL_STAGES) expect(callerPages).toContain(stage.id);
  });

  it("hides Settings from a cold caller and lands him on the first stage", () => {
    const ids = coldCallPagesFor(false).map((p) => p.id);
    expect(ids).not.toContain("settings");
    expect(ids).not.toContain("book");
    expect(ids[0]).toBe("new-lead");
  });

  it("keeps the book and the settings owner-only", () => {
    // A caller works his queue; he does not hand himself lists or edit the
    // script. The API refuses both independently of what renders.
    expect(COLD_CALL_PAGES.filter((p) => p.ownerOnly).map((p) => p.id)).toEqual([
      "book",
      "settings",
    ]);
  });

  it("has no page left over from the old mixed strip", () => {
    const ids = COLD_CALL_PAGES.map((p) => p.id);
    // Brushed Off left too: it became a reason on the Not Interested prompt
    // rather than a place a lead lives.
    for (const gone of ["leads", "callbacks", "stages", "pipelines", "brushed-off"]) {
      expect(ids).not.toContain(gone);
    }
  });
});

describe("resolveColdCallView", () => {
  it("returns a known page", () => {
    expect(resolveColdCallView("call-back", false)).toBe("call-back");
    expect(resolveColdCallView("settings", true)).toBe("settings");
  });

  it("lands on the first stage when the param is missing or nonsense", () => {
    expect(resolveColdCallView(null, false)).toBe("new-lead");
    expect(resolveColdCallView(undefined, true)).toBe("new-lead");
    expect(resolveColdCallView("", true)).toBe("new-lead");
    expect(resolveColdCallView("bogus", true)).toBe("new-lead");
  });

  it("sends a bookmark from the old strip somewhere real", () => {
    // ?view=leads was the old first page. It no longer exists, so it resolves
    // to the first stage rather than rendering nothing.
    expect(resolveColdCallView("leads", true)).toBe("new-lead");
  });

  it("sends a cold caller who types ?view=settings back to the first stage", () => {
    // Hiding the tab is not the enforcement (the API is), but a typed URL must
    // not render a page the role cannot use.
    expect(resolveColdCallView("settings", false)).toBe("new-lead");
  });
});
