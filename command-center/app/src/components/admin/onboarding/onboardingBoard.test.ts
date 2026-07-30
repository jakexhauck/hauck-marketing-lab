import { describe, expect, it } from "vitest";
import { STAGES, ageLabel, groupByStage } from "./OnboardingBoard";
import type { IntakeStatus, IntakeSubmissionSummary } from "../../../hooks/useIntake";

function sub(status: IntakeStatus, id: string = status): IntakeSubmissionSummary {
  return {
    id,
    name: "Willis Exteriors",
    niche: "Roofing",
    contactName: "Jim",
    loginEmail: null,
    status,
    furthestStep: 1,
    completeness: 50,
    tenantId: null,
    submittedAt: null,
    createdAt: "2026-07-20T00:00:00.000Z",
  };
}

describe("the board's stages", () => {
  it("runs in the order a client actually moves", () => {
    expect(STAGES.map((s) => s.key)).toEqual(["in_progress", "submitted", "approved"]);
  });

  it("gives rejected no column, because it is an end state not a stage", () => {
    expect(STAGES.some((s) => s.key === "rejected")).toBe(false);
  });
});

describe("groupByStage", () => {
  it("files each submission under its own stage", () => {
    const grouped = groupByStage([sub("submitted"), sub("in_progress"), sub("approved")]);
    expect(grouped.submitted).toHaveLength(1);
    expect(grouped.in_progress).toHaveLength(1);
    expect(grouped.approved).toHaveLength(1);
  });

  it("returns every stage even when empty, so columns never vanish", () => {
    const grouped = groupByStage([]);
    for (const stage of STAGES) expect(grouped[stage.key]).toEqual([]);
  });

  it("keeps rejected out of the three visible columns", () => {
    const grouped = groupByStage([sub("rejected")]);
    for (const stage of STAGES) expect(grouped[stage.key]).toEqual([]);
    expect(grouped.rejected).toHaveLength(1);
  });

  it("preserves order within a stage", () => {
    const grouped = groupByStage([sub("submitted", "first"), sub("submitted", "second")]);
    expect(grouped.submitted.map((s) => s.id)).toEqual(["first", "second"]);
  });
});

describe("ageLabel", () => {
  const now = new Date("2026-07-26T12:00:00.000Z").getTime();
  const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();

  it("says today for something that just arrived", () => {
    expect(ageLabel(daysAgo(0), now)).toBe("today");
  });

  it("says 1 day in the singular", () => {
    expect(ageLabel(daysAgo(1), now)).toBe("1 day");
  });

  it("pluralises beyond that", () => {
    expect(ageLabel(daysAgo(3), now)).toBe("3 days");
  });

  it("does not go negative on a clock skew", () => {
    expect(ageLabel(daysAgo(-2), now)).toBe("today");
  });
});
