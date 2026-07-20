import { describe, it, expect } from "vitest";
import { shapeSetterPipeline } from "./pipelines";

describe("shapeSetterPipeline", () => {
  it("sorts stages by live position, not array order", () => {
    const p = shapeSetterPipeline({
      id: "p1",
      name: "Lead Form Pipeline",
      stages: [
        { id: "s2", name: "Second", position: 1 },
        { id: "s1", name: "First", position: 0 },
      ],
    });
    expect(p.stages.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("flags a stage as needsDialing on a case-insensitive match anywhere in the name", () => {
    const p = shapeSetterPipeline({
      id: "p1",
      name: "Funnel Pipeline",
      stages: [
        { id: "s1", name: "Survey Completed No Call Booked (needs dialing)", position: 0 },
        { id: "s2", name: "NEEDS DIALING", position: 1 },
        { id: "s3", name: "Survey Follow Up", position: 2 },
      ],
    });
    expect(p.stages.find((s) => s.id === "s1")!.needsDialing).toBe(true);
    expect(p.stages.find((s) => s.id === "s2")!.needsDialing).toBe(true);
    expect(p.stages.find((s) => s.id === "s3")!.needsDialing).toBe(false);
  });

  it("carries the live stage color through unchanged", () => {
    const p = shapeSetterPipeline({
      id: "p1",
      name: "Customers Pipeline",
      stages: [{ id: "s1", name: "Recurring Customer", position: 0, color: "#16A34A" }],
    });
    expect(p.stages[0].color).toBe("#16A34A");
  });

  it("handles a pipeline with no stages at all", () => {
    const p = shapeSetterPipeline({ id: "p1", name: "Empty", stages: [] });
    expect(p.stages).toEqual([]);
  });

  it("handles a pipeline where stages is undefined", () => {
    const p = shapeSetterPipeline({ id: "p1", name: "Empty" } as { id: string; name: string });
    expect(p.stages).toEqual([]);
  });
});
