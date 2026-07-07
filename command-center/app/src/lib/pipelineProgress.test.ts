import { describe, expect, it } from "vitest";
import { resolveStageProgress } from "./pipelineProgress";

const STAGES = [
  { id: "s0", name: "New Lead" },
  { id: "s1", name: "Contacted" },
  { id: "s2", name: "Estimate Sent" },
  { id: "s3", name: "Job Scheduled" },
];

describe("resolveStageProgress", () => {
  it("marks earlier stages done, the match current, later upcoming", () => {
    const out = resolveStageProgress(STAGES, "s2");
    expect(out.map((s) => s.state)).toEqual([
      "done",
      "done",
      "current",
      "upcoming",
    ]);
  });

  it("first stage current => none done", () => {
    const out = resolveStageProgress(STAGES, "s0");
    expect(out.map((s) => s.state)).toEqual([
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("unknown or null stage id => all upcoming", () => {
    expect(
      resolveStageProgress(STAGES, "nope").every((s) => s.state === "upcoming"),
    ).toBe(true);
    expect(
      resolveStageProgress(STAGES, null).every((s) => s.state === "upcoming"),
    ).toBe(true);
  });

  it("empty stages => empty array", () => {
    expect(resolveStageProgress([], "s0")).toEqual([]);
  });
});
