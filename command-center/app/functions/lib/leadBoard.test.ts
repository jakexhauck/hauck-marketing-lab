import { describe, expect, it } from "vitest";
import { planMove, resolveBoardPipeline, stageByContact, stageKeyFor, type BoardStage } from "./leadBoard";

const TEST_V2 = {
  id: "pipe1",
  name: "Sales Pipeline",
  stages: [
    { id: "s-lead", name: "Lead", position: 0 },
    { id: "s-est", name: "Estimate Booked", position: 1 },
    { id: "s-job", name: "Job Booked", position: 2 },
    { id: "s-won", name: "Won", position: 3 },
    { id: "s-fu", name: "Follow Up", position: 4 },
    { id: "s-ltn", name: "Long Term Nurture", position: 5 },
    { id: "s-lost", name: "Lost", position: 6 },
    { id: "s-cxl", name: "Job/Estimate Cancelled", position: 7 },
    { id: "s-trash", name: "Trash", position: 8 },
  ],
};

describe("stageKeyFor", () => {
  it("maps every Test v2 stage name", () => {
    expect(TEST_V2.stages.map((s) => stageKeyFor(s.name))).toEqual([
      "lead",
      "estimate",
      "job",
      "won",
      "followUp",
      "nurture",
      "lost",
      "cancelled",
      "trash",
    ]);
  });
  it("reads Job Completed as the won stage (Test v2 rename)", () => {
    expect(stageKeyFor("Job Completed")).toBe("won");
  });
  it("tolerates case, spacing and emoji", () => {
    expect(stageKeyFor("  follow-up 📞")).toBe("followUp");
    expect(stageKeyFor("JOB BOOKED")).toBe("job");
  });
  it("returns null for stages it does not know", () => {
    expect(stageKeyFor("Handed Off")).toBeNull();
  });
});

describe("resolveBoardPipeline", () => {
  it("finds the Sales Pipeline and keeps GHL order", () => {
    const p = resolveBoardPipeline([TEST_V2]);
    expect(p?.pipelineId).toBe("pipe1");
    expect(p?.stages.map((s) => s.key)).toEqual([
      "lead", "estimate", "job", "won", "followUp", "nurture", "lost", "cancelled", "trash",
    ]);
  });
  it("orders by position even when GHL lists them shuffled", () => {
    const shuffled = { ...TEST_V2, stages: [...TEST_V2.stages].reverse() };
    expect(resolveBoardPipeline([shuffled])?.stages[0].name).toBe("Lead");
  });
  it("refuses an old-style pipeline without the board's core stages", () => {
    const willis = {
      id: "w",
      name: "3) Sales",
      stages: [
        { id: "a", name: "Handed Off", position: 0 },
        { id: "b", name: "Estimate Booked", position: 1 },
        { id: "c", name: "Won", position: 2 },
      ],
    };
    expect(resolveBoardPipeline([willis])).toBeNull();
  });
  it("picks the board pipeline among several", () => {
    const other = { id: "x", name: "1) Lead Form Pipeline", stages: [{ id: "q", name: "Opted In", position: 0 }] };
    expect(resolveBoardPipeline([other, TEST_V2])?.pipelineId).toBe("pipe1");
  });
});

describe("resolveBoardPipeline on the live Test v2 order (2026-10-08)", () => {
  it("accepts Job Completed in place of Won", () => {
    const live = {
      id: "FtzK3SIluUFIgm8Oi0se",
      name: "Sales Pipeline",
      stages: ["Lead", "Estimate Booked", "Job Booked", "Job Completed", "Follow Up", "Long Term Nurture", "Job/Estimate Cancelled", "Lost", "Trash"]
        .map((name, position) => ({ id: `s${position}`, name, position })),
    };
    expect(resolveBoardPipeline([live])?.stages.map((s) => s.key)).toEqual([
      "lead", "estimate", "job", "won", "followUp", "nurture", "cancelled", "lost", "trash",
    ]);
  });
});

const stages: BoardStage[] = resolveBoardPipeline([TEST_V2])!.stages;
const NOW = Date.parse("2026-10-08T15:00:00Z");

describe("planMove", () => {
  it("moves plainly to Lead, Long Term Nurture, Cancelled and Trash", () => {
    for (const id of ["s-lead", "s-ltn", "s-cxl", "s-trash"]) {
      const p = planMove(stages, { stageId: id });
      expect(p.ok).toBe(true);
      if (!p.ok) continue;
      expect(p.ghl).toEqual({ pipelineStageId: id, status: "open" });
      expect(p.booking).toBeUndefined();
      expect(p.closeBookings).toEqual([]);
    }
  });

  it("Cancelled never touches bookings", () => {
    const p = planMove(stages, { stageId: "s-cxl" });
    expect(p.ok && p.closeBookings).toEqual([]);
  });

  it("Follow Up needs a time and writes a follow-up", () => {
    expect(planMove(stages, { stageId: "s-fu" })).toEqual({ ok: false, error: "at_required" });
    const p = planMove(stages, { stageId: "s-fu", at: "2026-10-09T14:00:00Z", note: " call back " });
    expect(p.ok && p.followUp).toEqual({ dueAt: "2026-10-09T14:00:00.000Z", note: "call back" });
  });

  it("Estimate Booked needs a time and books an estimate", () => {
    expect(planMove(stages, { stageId: "s-est" })).toEqual({ ok: false, error: "at_required" });
    const p = planMove(stages, { stageId: "s-est", at: "2026-10-10T15:00:00Z" });
    expect(p.ok && p.booking).toEqual({ kind: "estimate", startsAt: "2026-10-10T15:00:00.000Z" });
  });

  it("Job Booked books a job and closes the open estimate", () => {
    const p = planMove(stages, { stageId: "s-job", at: "2026-10-12T13:00:00Z" });
    expect(p.ok && p.booking).toEqual({ kind: "job", startsAt: "2026-10-12T13:00:00.000Z" });
    expect(p.ok && p.closeBookings).toEqual(["estimate"]);
  });

  it("Won needs a positive amount, sets status won and closes bookings", () => {
    expect(planMove(stages, { stageId: "s-won" })).toEqual({ ok: false, error: "value_required" });
    expect(planMove(stages, { stageId: "s-won", value: 0 })).toEqual({ ok: false, error: "value_required" });
    const p = planMove(stages, { stageId: "s-won", value: 4200 });
    expect(p.ok && p.ghl).toEqual({ pipelineStageId: "s-won", status: "won", monetaryValue: 4200 });
    expect(p.ok && p.closeBookings).toEqual(["estimate", "job"]);
    expect(p.ok && p.wonValue).toBe(4200);
  });

  it("Lost needs a known reason and sets status lost", () => {
    expect(planMove(stages, { stageId: "s-lost" })).toEqual({ ok: false, error: "reason_required" });
    expect(planMove(stages, { stageId: "s-lost", lostReason: "nope" as never })).toEqual({
      ok: false,
      error: "reason_required",
    });
    const p = planMove(stages, { stageId: "s-lost", lostReason: "price" });
    expect(p.ok && p.ghl).toEqual({ pipelineStageId: "s-lost", status: "lost" });
    expect(p.ok && p.lostReason).toBe("price");
  });

  it("every move away from Follow Up closes the open follow-up", () => {
    const p = planMove(stages, { stageId: "s-est", at: "2026-10-10T15:00:00Z" });
    expect(p.ok && p.closeFollowUp).toBe(true);
    const fu = planMove(stages, { stageId: "s-fu", at: "2026-10-10T15:00:00Z" });
    expect(fu.ok && fu.closeFollowUp).toBe(false);
  });

  it("rejects an unknown stage and a bad time", () => {
    expect(planMove(stages, { stageId: "nope" })).toEqual({ ok: false, error: "unknown_stage" });
    expect(planMove(stages, { stageId: "s-est", at: "not a date" })).toEqual({ ok: false, error: "at_required" });
  });

  it("ignores NOW-relative rules: a past time is allowed (logging after the fact)", () => {
    const past = new Date(NOW - 86_400_000).toISOString();
    expect(planMove(stages, { stageId: "s-est", at: past }).ok).toBe(true);
  });
});

describe("stageByContact", () => {
  const pipeline = resolveBoardPipeline([TEST_V2])!;

  it("gives each contact the name and key of the stage its card sits in", () => {
    const map = stageByContact(pipeline, [
      { contactId: "c1", pipelineId: "pipe1", pipelineStageId: "s-est", createdAt: "2026-10-01T00:00:00Z" },
      { contactId: "c2", pipelineId: "pipe1", pipelineStageId: "s-ltn", createdAt: "2026-10-01T00:00:00Z" },
    ]);
    expect(map.get("c1")).toEqual({ name: "Estimate Booked", key: "estimate" });
    expect(map.get("c2")).toEqual({ name: "Long Term Nurture", key: "nurture" });
  });

  it("ignores cards in other pipelines and contactless cards", () => {
    const map = stageByContact(pipeline, [
      { contactId: "c1", pipelineId: "other", pipelineStageId: "s-est", createdAt: "" },
      { contactId: "", pipelineId: "pipe1", pipelineStageId: "s-est", createdAt: "" },
    ]);
    expect(map.size).toBe(0);
  });

  it("takes the newest card when a contact holds two", () => {
    const map = stageByContact(pipeline, [
      { contactId: "c1", pipelineId: "pipe1", pipelineStageId: "s-won", createdAt: "2026-09-01T00:00:00Z" },
      { contactId: "c1", pipelineId: "pipe1", pipelineStageId: "s-lead", createdAt: "2026-10-05T00:00:00Z" },
      { contactId: "c1", pipelineId: "pipe1", pipelineStageId: "s-fu", createdAt: "2026-09-20T00:00:00Z" },
    ]);
    expect(map.get("c1")?.name).toBe("Lead");
  });

  it("keeps a stage the board has no key for, by its GHL name", () => {
    const p = resolveBoardPipeline([
      { ...TEST_V2, stages: [...TEST_V2.stages, { id: "s-x", name: "Warranty Visit", position: 9 }] },
    ])!;
    const map = stageByContact(p, [
      { contactId: "c1", pipelineId: "pipe1", pipelineStageId: "s-x", createdAt: "" },
    ]);
    expect(map.get("c1")).toEqual({ name: "Warranty Visit", key: null });
  });
});
