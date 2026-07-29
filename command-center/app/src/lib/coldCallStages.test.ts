import { describe, expect, it } from "vitest";
import {
  COLD_CALL_STAGES,
  STAGE_LABELS,
  resolveStageId,
  stageById,
  stageByLabel,
} from "./coldCallStages";

// The stage list is a mirror of a live GHL pipeline, so the tests that matter
// are the ones that catch drift: a renamed stage, a duplicate slug, or a tag
// that no longer exists in the account.

describe("COLD_CALL_STAGES", () => {
  it("mirrors the live Cold Call Leads pipeline, in pipeline order", () => {
    // Pulled live from location wbrjjHYzznyEHx9wumSr on 2026-07-26. If GHL
    // changes, this test fails first and the list gets updated deliberately.
    expect(STAGE_LABELS).toEqual([
      "New Lead",
      "1st Dial (Day 1)",
      "2nd Dial (Day 2)",
      "Brushed Off",
      "Call Back",
      "Booked",
      "Not Interested",
    ]);
  });

  it("gives every stage a unique id", () => {
    const ids = COLD_CALL_STAGES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every stage a unique label", () => {
    const labels = COLD_CALL_STAGES.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("uses url-safe ids", () => {
    for (const stage of COLD_CALL_STAGES) {
      expect(stage.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("maps each stage to a tag that exists in the agency account", () => {
    // The tags live in GHL and drive the automations that move a lead. New Lead
    // has none: nothing tags a lead that has never been dialed.
    const tags = COLD_CALL_STAGES.map((s) => s.tag);
    expect(tags).toEqual([
      null,
      "cc no answer day 1",
      "cc no answer day 2",
      "cc brush off",
      "cc call back",
      "cc demo call booked",
      "cc not interested",
    ]);
  });

  it("gives every stage a meaning and a colour", () => {
    for (const stage of COLD_CALL_STAGES) {
      expect(stage.meaning.length).toBeGreaterThan(0);
      expect(stage.swatch).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("stageById", () => {
  it("finds a stage", () => {
    expect(stageById("call-back")?.label).toBe("Call Back");
  });

  it("returns null for an unknown id", () => {
    expect(stageById("nonsense")).toBeNull();
    expect(stageById(null)).toBeNull();
  });
});

describe("stageByLabel", () => {
  it("finds a stage by its stored status", () => {
    expect(stageByLabel("2nd Dial (Day 2)")?.id).toBe("second-dial");
  });

  it("returns null for a retired status", () => {
    // "Qualified" was part of the invented vocabulary this replaced.
    expect(stageByLabel("Qualified")).toBeNull();
  });
});

describe("resolveStageId", () => {
  it("keeps a known stage", () => {
    expect(resolveStageId("booked")).toBe("booked");
  });

  it("falls back to the first stage when the param is unknown or missing", () => {
    expect(resolveStageId(null)).toBe("new-lead");
    expect(resolveStageId("")).toBe("new-lead");
    expect(resolveStageId("qualified")).toBe("new-lead");
  });

  it("passes the tracker through, since it shares the strip but is not a stage", () => {
    expect(resolveStageId("tracker")).toBe("tracker");
  });
});
