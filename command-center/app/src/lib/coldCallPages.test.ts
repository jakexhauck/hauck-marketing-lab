import { describe, expect, it } from "vitest";
import {
  COLD_CALL_PAGES,
  MANAGEMENT_PAGES,
  coldCallPagesFor,
  coldCallSides,
  movedIntoManagement,
  resolveColdCallView,
  resolveManagementPage,
} from "./coldCallPages";
import { COLD_CALL_STAGES } from "./coldCallStages";

describe("coldCallPagesFor", () => {
  it("is the pipeline in order, then the tracker, then what an owner runs", () => {
    expect(coldCallPagesFor(true).map((p) => p.id)).toEqual([
      "new-lead",
      "first-dial",
      "second-dial",
      "call-back",
      "booked",
      "tracker",
      "availability",
      "sops",
      "management",
    ]);
  });

  it("gives a caller every worked stage, his own tracker and his own availability", () => {
    // All of the WORK is his job: hiding a stage would hide part of it, hiding
    // the tracker would hide the numbers he is measured on, and hiding
    // availability would leave his hours to be guessed at by someone else.
    const ids = coldCallPagesFor(false).map((p) => p.id);
    for (const stage of COLD_CALL_STAGES.filter((s) => s.page)) {
      expect(ids).toContain(stage.id);
    }
    expect(ids).toContain("tracker");
    expect(ids).toContain("availability");
    // The SOPs are written FOR him. A caller who cannot read how the job is
    // done is the one person who needed the page.
    expect(ids).toContain("sops");
    // Not Interested is a stage without a page. Nobody works a list of hard
    // noes, so it is recorded and tagged but never rendered as a tab.
    expect(ids).not.toContain("not-interested");
  });

  it("keeps management owner-only, and it is the only owner-side tab", () => {
    const ids = coldCallPagesFor(false).map((p) => p.id);
    expect(ids).not.toContain("management");
    expect(COLD_CALL_PAGES.filter((p) => p.ownerOnly).map((p) => p.id)).toEqual([
      "management",
    ]);
  });

  it("no longer offers Assign or Settings as top-level pages", () => {
    // Both became pages inside Management. Leaving either in both places would
    // give one surface two URLs and two places to look for it.
    const ids = COLD_CALL_PAGES.map((p) => p.id);
    expect(ids).not.toContain("assign");
    expect(ids).not.toContain("settings");
  });

  it("has no page left over from an earlier strip", () => {
    // Leads/Callbacks became stages; Brushed Off became a reason; Pipelines and
    // the Scoreboard are gone; Book is now Assign.
    const ids = COLD_CALL_PAGES.map((p) => p.id);
    for (const gone of [
      "leads",
      "callbacks",
      "stages",
      "pipelines",
      "brushed-off",
      "scoreboard",
      "book",
    ]) {
      expect(ids).not.toContain(gone);
    }
  });
});

describe("coldCallSides", () => {
  it("splits the work from the running of it", () => {
    const { left, right } = coldCallSides(true);
    expect(left.map((p) => p.id)).toEqual([
      "new-lead",
      "first-dial",
      "second-dial",
      "call-back",
      "booked",
      "tracker",
      "availability",
      "sops",
    ]);
    expect(right.map((p) => p.id)).toEqual(["management"]);
  });

  it("gives a caller no right-hand group at all, so he gets no divider", () => {
    const { left, right } = coldCallSides(false);
    expect(right).toEqual([]);
    expect(left.length).toBeGreaterThan(0);
  });

  it("loses no page in the split", () => {
    const { left, right } = coldCallSides(true);
    expect(left.length + right.length).toBe(coldCallPagesFor(true).length);
  });
});

describe("resolveColdCallView", () => {
  it("returns a known page", () => {
    expect(resolveColdCallView("call-back", false)).toBe("call-back");
    expect(resolveColdCallView("management", true)).toBe("management");
  });

  it("lands on the first stage when the param is missing or nonsense", () => {
    expect(resolveColdCallView(null, false)).toBe("new-lead");
    expect(resolveColdCallView(undefined, true)).toBe("new-lead");
    expect(resolveColdCallView("", true)).toBe("new-lead");
    expect(resolveColdCallView("bogus", true)).toBe("new-lead");
  });

  it("sends a bookmark from an earlier strip somewhere real", () => {
    // ?view=book and ?view=scoreboard were both real pages an hour ago.
    expect(resolveColdCallView("book", true)).toBe("new-lead");
    expect(resolveColdCallView("scoreboard", true)).toBe("new-lead");
  });

  it("sends a cold caller who types ?view=assign back to the first stage", () => {
    // Hiding the tab is not the enforcement (the API is), but a typed URL must
    // not render a page the role cannot use.
    expect(resolveColdCallView("assign", false)).toBe("new-lead");
    expect(resolveColdCallView("management", false)).toBe("new-lead");
    expect(resolveColdCallView("settings", false)).toBe("new-lead");
  });

  it("opens Management for an owner's old ?view=assign or ?view=settings link", () => {
    // Both were their own tab until they moved inside Management. A bookmark or
    // a pasted link should land on the page it names, not on the first stage.
    expect(resolveColdCallView("assign", true)).toBe("management");
    expect(resolveColdCallView("settings", true)).toBe("management");
  });
});

describe("resolveManagementPage", () => {
  it("returns a known page", () => {
    expect(resolveManagementPage("assign")).toBe("assign");
    expect(resolveManagementPage("availability")).toBe("availability");
    expect(resolveManagementPage("scripts")).toBe("scripts");
    expect(resolveManagementPage("sops")).toBe("sops");
    expect(resolveManagementPage("stages")).toBe("stages");
  });

  it("sends the retired Call shelf to the page that now holds its document", () => {
    // The shelf held exactly one document, objection handling, which is edited
    // on Scripts because that is where it is read. A bookmark to ?manage=assets
    // must land there rather than silently dropping onto the default page, which
    // would look like the link simply did nothing.
    expect(resolveManagementPage("assets")).toBe("scripts");
    expect(MANAGEMENT_PAGES.map((p) => p.id)).not.toContain("assets");
  });

  it("writing SOPs is a Management page, reading them is a strip page", () => {
    // The same id deliberately exists in both lists: they are different params
    // (?manage= writes, ?view= reads) and different audiences. This pins that
    // the pair stays in step, since removing either half strands the other.
    expect(MANAGEMENT_PAGES.map((p) => p.id)).toContain("sops");
    expect(COLD_CALL_PAGES.map((p) => p.id)).toContain("sops");
    // The reading side must NOT be owner-only, or the team cannot reach it.
    expect(COLD_CALL_PAGES.find((p) => p.id === "sops")?.ownerOnly).toBeFalsy();
  });

  it("holds everything the retired Settings page held", () => {
    // Settings stacked three panels on one page. Losing one of them in the move
    // would be silent: nothing else in the app links to them.
    //
    // The shelf is absent on purpose and covered by the test above: its one
    // document moved onto Scripts rather than being dropped.
    const ids = MANAGEMENT_PAGES.map((p) => p.id);
    for (const page of ["scripts", "stages"]) expect(ids).toContain(page);
  });

  it("has no page called settings", () => {
    expect(MANAGEMENT_PAGES.map((p) => p.id)).not.toContain("settings");
  });

  it("defaults to Assign, the page opened daily", () => {
    expect(resolveManagementPage(null)).toBe("assign");
    expect(resolveManagementPage(undefined)).toBe("assign");
    expect(resolveManagementPage("")).toBe("assign");
    expect(resolveManagementPage("bogus")).toBe("assign");
  });
});

describe("movedIntoManagement", () => {
  it("maps a retired top-level page to its new home", () => {
    expect(movedIntoManagement("assign", true)).toBe("assign");
    // Settings was three panels; its link opens the first of them rather than
    // Management's own default, which was never part of that page.
    expect(movedIntoManagement("settings", true)).toBe("scripts");
  });

  it("is null for a page that never moved", () => {
    expect(movedIntoManagement("tracker", true)).toBeNull();
    expect(movedIntoManagement("booked", true)).toBeNull();
    expect(movedIntoManagement(null, true)).toBeNull();
  });

  it("is null for a cold caller, who has no Management to land in", () => {
    expect(movedIntoManagement("assign", false)).toBeNull();
  });
});
