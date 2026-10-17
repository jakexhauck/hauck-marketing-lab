import { describe, it, expect } from "vitest";
import { BRIEF_SECTIONS, briefRevision, fullBrief, sectionLabel, whoEdited } from "./clientBrief";

describe("BRIEF_SECTIONS", () => {
  it("has one section per agent, Status first", () => {
    expect(BRIEF_SECTIONS.map((s) => s.id)).toEqual(["manager", "research", "ads", "creative", "landing", "ghl", "reporting"]);
    expect(BRIEF_SECTIONS.map((s) => s.label)).toEqual([
      "Status",
      "Market Research",
      "Ads",
      "Creative",
      "Landing Page",
      "GHL",
      "Reporting",
    ]);
    expect(sectionLabel("landing")).toBe("Landing Page");
  });
});

describe("fullBrief", () => {
  it("fills missing sections as unwritten and keeps the order", () => {
    const out = fullBrief([
      { section: "ads", body: "Cap $40/day", version: 3, updatedBy: "jake", updatedAt: "2026-10-17T10:00:00Z" },
    ]);
    expect(out.map((s) => s.section)).toEqual(BRIEF_SECTIONS.map((s) => s.id));
    expect(out[2]).toMatchObject({ section: "ads", body: "Cap $40/day", version: 3 });
    expect(out[0]).toEqual({ section: "manager", body: "", version: 0, updatedBy: null, updatedAt: null });
  });

  it("ignores rows for unknown sections", () => {
    const out = fullBrief([{ section: "nope" as never, body: "x", version: 1, updatedBy: "jake", updatedAt: null }]);
    expect(out.every((s) => s.version === 0)).toBe(true);
  });
});

describe("briefRevision", () => {
  it("is the sum of the versions, so every save moves it", () => {
    expect(briefRevision(fullBrief([]))).toBe(0);
    expect(
      briefRevision([
        { section: "ads", body: "", version: 3, updatedBy: "jake", updatedAt: null },
        { section: "ghl", body: "", version: 2, updatedBy: "ghl", updatedAt: null },
      ]),
    ).toBe(5);
  });
});

describe("whoEdited", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  it("names Jake as You and an agent by its name", () => {
    expect(whoEdited({ updatedBy: "jake", updatedAt: "2026-10-17T11:59:40Z" }, now)).toBe("You, just now");
    expect(whoEdited({ updatedBy: "research", updatedAt: "2026-10-17T10:00:00Z" }, now)).toBe("Market Research Agent, 2h ago");
    expect(whoEdited({ updatedBy: "ads", updatedAt: "2026-10-17T11:45:00Z" }, now)).toBe("Ads Agent, 15 min ago");
  });

  it("is empty for a section nobody wrote", () => {
    expect(whoEdited({ updatedBy: null, updatedAt: null }, now)).toBe("");
  });
});
