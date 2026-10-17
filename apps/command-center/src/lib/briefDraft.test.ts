import { describe, it, expect } from "vitest";
import { briefDraft, initDraft, needsSave, type DraftState } from "./briefDraft";
import type { BriefSection } from "./agentWire";

const sec = (version: number, body: string, updatedBy: BriefSection["updatedBy"] = "jake"): BriefSection => ({
  section: "ads",
  body,
  version,
  updatedBy,
  updatedAt: null,
});

const start = () => initDraft(sec(3, "Cap $40/day"));

describe("briefDraft", () => {
  it("needs a save only when the text moved and nothing is in flight", () => {
    let s = start();
    expect(needsSave(s)).toBe(false);
    s = briefDraft(s, { t: "edit", text: "Cap $50/day" });
    expect(needsSave(s)).toBe(true);
    s = briefDraft(s, { t: "saving" });
    expect(needsSave(s)).toBe(false);
  });

  it("keeps typing made during a save, and saves that next", () => {
    let s = briefDraft(start(), { t: "edit", text: "Cap $50" });
    s = briefDraft(s, { t: "saving" });
    s = briefDraft(s, { t: "edit", text: "Cap $50/day" });
    s = briefDraft(s, { t: "saved", section: sec(4, "Cap $50") });
    expect(s.base.version).toBe(4);
    expect(s.draft).toBe("Cap $50/day");
    expect(needsSave(s)).toBe(true);
  });

  it("on a stale save shows the newer text and keeps the draft to reapply", () => {
    let s = briefDraft(start(), { t: "edit", text: "mine" });
    s = briefDraft(s, { t: "saving" });
    s = briefDraft(s, { t: "stale", section: sec(4, "agent text", "ads") });
    expect(s.draft).toBe("agent text");
    expect(s.base.version).toBe(4);
    expect(s.conflict).toEqual({ theirs: sec(4, "agent text", "ads"), mine: "mine" });
    expect(needsSave(s)).toBe(false);

    const reapplied = briefDraft(s, { t: "reapply" });
    expect(reapplied.draft).toBe("mine");
    expect(reapplied.conflict).toBeNull();
    expect(needsSave(reapplied)).toBe(true);

    const dropped = briefDraft(s, { t: "discard" });
    expect(dropped.draft).toBe("agent text");
    expect(needsSave(dropped)).toBe(false);
  });

  it("takes a newer copy from the server when nothing is unsaved", () => {
    const s = briefDraft(start(), { t: "server", section: sec(4, "agent text", "ads") });
    expect(s.draft).toBe("agent text");
    expect(s.conflict).toBeNull();
  });

  it("ignores an older or same copy from the server", () => {
    const edited = briefDraft(start(), { t: "edit", text: "mine" });
    expect(briefDraft(edited, { t: "server", section: sec(3, "Cap $40/day") })).toBe(edited);
    expect(briefDraft(edited, { t: "server", section: sec(2, "old") })).toBe(edited);
  });

  it("flags a newer copy that lands under unsaved text as a conflict at once", () => {
    const edited = briefDraft(start(), { t: "edit", text: "mine" });
    const s = briefDraft(edited, { t: "server", section: sec(4, "agent text", "ads") });
    expect(s.conflict?.mine).toBe("mine");
    expect(s.draft).toBe("agent text");
  });

  it("is not a conflict when the newer copy is the text already in the box", () => {
    let s: DraftState = briefDraft(start(), { t: "edit", text: "mine" });
    s = briefDraft(s, { t: "saving" });
    s = briefDraft(s, { t: "server", section: sec(4, "mine") });
    expect(s.conflict).toBeNull();
    expect(s.base.version).toBe(4);
  });

  it("holds a failed save until the next edit, so it does not retry in a loop", () => {
    let s = briefDraft(start(), { t: "edit", text: "mine" });
    s = briefDraft(s, { t: "saving" });
    s = briefDraft(s, { t: "failed", error: "offline" });
    expect(s.error).toBe("offline");
    expect(needsSave(s)).toBe(false);
    s = briefDraft(s, { t: "edit", text: "mine!" });
    expect(s.error).toBeNull();
    expect(needsSave(s)).toBe(true);
  });
});
