import { describe, it, expect } from "vitest";
import {
  BRIEF_SECTIONS,
  briefRevision,
  driveChip,
  fullBrief,
  isBriefSectionId,
  sectionLabel,
  tickSections,
  whoEdited,
} from "./clientBrief";

describe("BRIEF_SECTIONS", () => {
  it("is Client, Status, the two calls, then one section per agent", () => {
    expect(BRIEF_SECTIONS.map((s) => s.id)).toEqual([
      "client",
      "manager",
      "onboarding-call",
      "launch-call",
      "research",
      "ads",
      "creative",
      "landing",
      "ghl",
      "reporting",
    ]);
    expect(BRIEF_SECTIONS.map((s) => s.label)).toEqual([
      "Client",
      "Status",
      "Onboarding Call",
      "Launch Call",
      "Market Research",
      "Ads",
      "Creative",
      "Landing Page",
      "GHL",
      "Reporting",
    ]);
    expect(sectionLabel("landing")).toBe("Landing Page");
    expect(sectionLabel("onboarding-call")).toBe("Onboarding Call");
  });

  it("knows its own ids and nothing else", () => {
    expect(isBriefSectionId("client")).toBe(true);
    expect(isBriefSectionId("launch-call")).toBe(true);
    expect(isBriefSectionId("ads")).toBe(true);
    expect(isBriefSectionId("full-setup")).toBe(false);
    expect(isBriefSectionId(undefined)).toBe(false);
  });
});

describe("tickSections", () => {
  it("lets the Manager tick Status and both calls, every other agent only its own", () => {
    expect(tickSections("manager")).toEqual(["manager", "onboarding-call", "launch-call"]);
    expect(tickSections("ads")).toEqual(["ads"]);
    expect(tickSections("research")).toEqual(["research"]);
  });
});

describe("fullBrief", () => {
  it("fills missing sections as unwritten and keeps the order", () => {
    const out = fullBrief([
      { section: "ads", body: "Cap $40/day", version: 3, updatedBy: "jake", updatedAt: "2026-10-17T10:00:00Z" },
    ]);
    expect(out.map((s) => s.section)).toEqual(BRIEF_SECTIONS.map((s) => s.id));
    expect(out[5]).toMatchObject({ section: "ads", body: "Cap $40/day", version: 3 });
    expect(out[1]).toEqual({ section: "manager", body: "", version: 0, updatedBy: null, updatedAt: null });
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
      briefRevision(
        fullBrief([
          { section: "ads", body: "", version: 3, updatedBy: "jake", updatedAt: null },
          { section: "ghl", body: "", version: 2, updatedBy: "ghl", updatedAt: null },
        ]),
      ),
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

describe("driveChip", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const written = fullBrief([{ section: "ads", body: "x", version: 2, updatedBy: "jake", updatedAt: "2026-10-17T11:59:30Z" }]);
  const drive = (revision: number, error: string | null = null) => ({ docUrl: "https://docs.google.com/document/d/d1/edit", syncedAt: null, error, revision });

  it("is Saved to Drive when the Doc holds the brief as it stands", () => {
    expect(driveChip(drive(2), written, now)).toMatchObject({ tone: "ok", label: "Saved to Drive" });
  });

  it("is on its way just after a save, out of date once that is long past", () => {
    expect(driveChip(drive(1), written, now)).toMatchObject({ tone: "busy" });
    expect(driveChip(null, written, now)).toMatchObject({ tone: "busy" });
    expect(driveChip(drive(1), written, new Date("2026-10-17T12:10:00Z"))).toMatchObject({ tone: "bad", label: "Drive out of date" });
  });

  it("shows a failed sync with its reason", () => {
    expect(driveChip(drive(2, "This client has no Drive folder."), written, now)).toEqual({
      tone: "bad",
      label: "Drive sync failed",
      title: "This client has no Drive folder.",
    });
  });

  it("is neutral before anything is written", () => {
    expect(driveChip(null, fullBrief([]), now).tone).toBe("none");
  });
});
