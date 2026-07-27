import { describe, it, expect } from "vitest";
import type { AgencyPipeline } from "./api";
import { COLD_CALL_STAGES } from "./coldCallStages";
import { compareStages, pickColdCallPipeline } from "./stageDrift";

const APP_STAGE_NAMES = COLD_CALL_STAGES.map((s) => s.label);

function pipeline(name: string, stages: string[]): AgencyPipeline {
  return {
    id: `pipe-${name}`,
    name,
    stages: stages.map((s, i) => ({ id: `stage-${i}`, name: s })),
  };
}

// The account exactly as the app expects it.
const inSync = pipeline("Cold Calling", [...APP_STAGE_NAMES]);

describe("pickColdCallPipeline", () => {
  it("picks the board whose stages overlap the app's, whatever it is called", () => {
    const picked = pickColdCallPipeline([
      pipeline("Client Onboarding", ["Kickoff", "Live"]),
      pipeline("Outbound 2026", [...APP_STAGE_NAMES]),
    ]);
    expect(picked?.name).toBe("Outbound 2026");
  });

  it("falls back to the name when nothing overlaps", () => {
    const picked = pickColdCallPipeline([
      pipeline("Client Onboarding", ["Kickoff", "Live"]),
      pipeline("Cold Calling", ["Something Else Entirely"]),
    ]);
    expect(picked?.name).toBe("Cold Calling");
  });

  it("refuses to guess when nothing matches on either count", () => {
    expect(
      pickColdCallPipeline([pipeline("Client Onboarding", ["Kickoff", "Live"])]),
    ).toBeNull();
  });

  it("has nothing to pick from an empty account", () => {
    expect(pickColdCallPipeline([])).toBeNull();
  });
});

describe("compareStages", () => {
  it("reports a matching account as in sync", () => {
    const result = compareStages([inSync]);
    expect(result.inSync).toBe(true);
    expect(result.pipelineName).toBe("Cold Calling");
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
    expect(result.rows.every((r) => r.match === "matched")).toBe(true);
  });

  it("ignores case and spacing, which are typing rather than identity", () => {
    const sloppy = pipeline(
      "Cold Calling",
      APP_STAGE_NAMES.map((n) => `  ${n.toUpperCase()}  `),
    );
    expect(compareStages([sloppy]).inSync).toBe(true);
  });

  // The live case at the time of writing: Brushed Off is still a stage in
  // GoHighLevel and the app no longer has one.
  it("flags a stage GoHighLevel has and the app does not", () => {
    const result = compareStages([
      pipeline("Cold Calling", [...APP_STAGE_NAMES, "Brushed Off"]),
    ]);
    expect(result.inSync).toBe(false);
    expect(result.extra).toEqual(["Brushed Off"]);
    expect(result.missing).toEqual([]);
    expect(result.rows.at(-1)).toEqual({ name: "Brushed Off", match: "extra" });
  });

  it("flags a stage the app expects and GoHighLevel has lost", () => {
    const renamed = APP_STAGE_NAMES.filter((n) => n !== "Call Back");
    const result = compareStages([pipeline("Cold Calling", renamed)]);
    expect(result.missing).toEqual(["Call Back"]);
    expect(result.inSync).toBe(false);
  });

  // A rename is the drift that actually happens, and it shows as both halves:
  // the old name gone, the new one unaccounted for.
  it("reads a rename as one missing and one extra", () => {
    const renamed = APP_STAGE_NAMES.map((n) => (n === "Booked" ? "Demo Booked" : n));
    const result = compareStages([pipeline("Cold Calling", renamed)]);
    expect(result.missing).toEqual(["Booked"]);
    expect(result.extra).toEqual(["Demo Booked"]);
  });

  it("never claims sync when it could not identify the board", () => {
    const result = compareStages([pipeline("Client Onboarding", ["Kickoff"])]);
    expect(result.pipelineName).toBeNull();
    expect(result.inSync).toBe(false);
    // Every app stage is unaccounted for, which is the honest reading.
    expect(result.missing).toEqual(APP_STAGE_NAMES);
  });

  it("keeps the app's own order, since that is the order of the pages", () => {
    const shuffled = pipeline("Cold Calling", [...APP_STAGE_NAMES].reverse());
    expect(compareStages([shuffled]).rows.map((r) => r.name)).toEqual(APP_STAGE_NAMES);
  });
});
