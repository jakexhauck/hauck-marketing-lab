import { describe, it, expect } from "vitest";
import { checklistCounts, metaWeek, redCount, stuckInNew } from "./agentSnapshot";

describe("metaWeek", () => {
  it("cost per lead from spend and Meta's lead roll-up", () => {
    const row = {
      spend: "120.50",
      frequency: "2.4",
      actions: [
        { action_type: "lead", value: "10" },
        { action_type: "offsite_conversion.fb_pixel_lead", value: "7" },
        { action_type: "onsite_conversion.lead_grouped", value: "3" },
      ],
    };
    // 10 leads, not 20: the roll-up is taken, not the sum of its parts.
    expect(metaWeek(row)).toEqual({ cpl: 12.05, frequency: 2.4, leads7d: 10 });
  });

  it("no leads means no cost per lead, never a divide by zero", () => {
    expect(metaWeek({ spend: "40", frequency: "1.1", actions: [] })).toEqual({ cpl: null, frequency: 1.1, leads7d: 0 });
  });

  it("no delivery at all reads as unknown", () => {
    expect(metaWeek(null)).toEqual({ cpl: null, frequency: null, leads7d: 0 });
  });
});

describe("stuckInNew", () => {
  const now = new Date("2026-10-17T12:00:00.000Z");
  const opp = (id: string, over: Record<string, unknown>) => ({ id, status: "open", pipelineStageId: "new", ...over });

  it("counts open leads that have sat in New for more than 48 hours", () => {
    const opps = [
      opp("old", { createdAt: "2026-10-15T11:00:00.000Z" }),
      opp("fresh", { createdAt: "2026-10-16T12:00:00.000Z" }),
      // Moved back into New yesterday: the stage change is what counts.
      opp("moved", { createdAt: "2026-10-01T00:00:00.000Z", lastStageChangeAt: "2026-10-16T20:00:00.000Z" }),
      opp("won", { createdAt: "2026-10-01T00:00:00.000Z", status: "won" }),
      opp("other", { createdAt: "2026-10-01T00:00:00.000Z", pipelineStageId: "estimate" }),
    ];
    expect(stuckInNew(opps, new Set(["new"]), now)).toBe(1);
  });
});

describe("checklistCounts", () => {
  it("counts the client's Director tasks done, out of those not cut", () => {
    const rows = [{ state: "done" }, { state: "todo" }, { state: "doing" }, { state: "cut" }, { state: "done" }];
    expect(checklistCounts(rows)).toEqual({ checklistDone: 2, checklistTotal: 4 });
  });
});

describe("redCount", () => {
  it("counts the red rows, not the blocked or unknown ones", () => {
    expect(
      redCount([
        { id: "ghl", state: "missing", detail: "" },
        { id: "push", state: "missing", detail: "" },
        { id: "pipeline", state: "blocked", detail: "" },
        { id: "login", state: "ok", detail: "" },
        { id: "calendars", state: "unknown", detail: "" },
      ]),
    ).toBe(2);
  });
});
