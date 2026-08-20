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
  it("opens on the power dialer, then the board, then what an owner runs", () => {
    expect(coldCallPagesFor(true).map((p) => p.id)).toEqual([
      "dialing",
      "pipeline",
      "tracker",
      "availability",
      "sops",
      "management",
    ]);
  });

  it("has no page per stage: a stage is a column of the board", () => {
    // The five stage pages became one board. Putting either back would give a
    // stage two places to be read and two counts to disagree.
    const ids = COLD_CALL_PAGES.map((p) => p.id);
    for (const stage of COLD_CALL_STAGES) expect(ids).not.toContain(stage.id);
  });

  it("gives a caller the dialer, the board, his tracker and his availability", () => {
    // All of the WORK is his job: hiding the board would hide where his
    // prospects stand, hiding the tracker would hide the numbers he is measured
    // on, and hiding availability would leave his hours to be guessed at by
    // someone else.
    const ids = coldCallPagesFor(false).map((p) => p.id);
    expect(ids).toContain("dialing");
    expect(ids).toContain("pipeline");
    expect(ids).toContain("tracker");
    expect(ids).toContain("availability");
    // The SOPs are written FOR him. A caller who cannot read how the job is
    // done is the one person who needed the page.
    expect(ids).toContain("sops");
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
    // Leads/Callbacks became stages and the stages became columns; Brushed Off
    // became a reason; the Scoreboard is gone; Book is now Assign. "pipelines",
    // plural, was a tab per GHL board and is not this page.
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
      "dialing",
      "pipeline",
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
    expect(resolveColdCallView("pipeline", false)).toBe("pipeline");
    expect(resolveColdCallView("management", true)).toBe("management");
  });

  it("lands on the power dialer when the param is missing or nonsense", () => {
    expect(resolveColdCallView(null, false)).toBe("dialing");
    expect(resolveColdCallView(undefined, true)).toBe("dialing");
    expect(resolveColdCallView("", true)).toBe("dialing");
    expect(resolveColdCallView("bogus", true)).toBe("dialing");
  });

  it("opens the board for a link to a stage that used to be a page", () => {
    // Every stage was its own tab until the board replaced them, so these are
    // live bookmarks. Landing them on the Power dialer would look like the link
    // did nothing; the board is where that stage now is.
    for (const stage of COLD_CALL_STAGES) {
      expect(resolveColdCallView(stage.id, true)).toBe("pipeline");
      expect(resolveColdCallView(stage.id, false)).toBe("pipeline");
    }
  });

  it("sends a bookmark from an earlier strip somewhere real", () => {
    // ?view=book and ?view=scoreboard were both real pages once.
    expect(resolveColdCallView("book", true)).toBe("dialing");
    expect(resolveColdCallView("scoreboard", true)).toBe("dialing");
  });

  it("sends a cold caller who types ?view=assign back to the first page", () => {
    // Hiding the tab is not the enforcement (the API is), but a typed URL must
    // not render a page the role cannot use.
    expect(resolveColdCallView("assign", false)).toBe("dialing");
    expect(resolveColdCallView("management", false)).toBe("dialing");
    expect(resolveColdCallView("settings", false)).toBe("dialing");
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
    expect(movedIntoManagement("pipeline", true)).toBeNull();
    expect(movedIntoManagement(null, true)).toBeNull();
  });

  it("is null for a cold caller, who has no Management to land in", () => {
    expect(movedIntoManagement("assign", false)).toBeNull();
  });
});
