import { describe, expect, it } from "vitest";
import { lostReasonFor, outcomePage, parseOutcomeBody, stageKeyFor, timeLabel } from "./outcome";
import { planMove, stageKeyFor as boardKey, type BoardStage } from "./leadBoard";

const SLOT = "2026-10-14T10:00:00-04:00";
const form = { address: "1 Elm St", services: "Opener", notes: "" };

describe("parseOutcomeBody", () => {
  it("reads every answer", () => {
    expect(parseOutcomeBody({ outcome: "estimate_booked", slot: SLOT, form })).toEqual({
      outcome: "estimate_booked",
      slot: SLOT,
      form,
    });
    expect(parseOutcomeBody({ outcome: "job_closed", amount: "$4,200", slot: SLOT, form })).toEqual({
      outcome: "job_closed",
      amountCents: 420000,
      slot: SLOT,
      form,
    });
    expect(parseOutcomeBody({ outcome: "call_back", date: "2026-10-14", time: "13:00" })).toEqual({
      outcome: "call_back",
      date: "2026-10-14",
      time: "13:00",
    });
    expect(parseOutcomeBody({ outcome: "no_answer" })).toEqual({ outcome: "no_answer" });
    expect(parseOutcomeBody({ outcome: "not_interested", reason: "Spam" })).toEqual({
      outcome: "not_interested",
      reason: "Spam",
    });
  });

  it("refuses what a stage needs and did not get", () => {
    expect(parseOutcomeBody({ outcome: "estimate_booked" })).toHaveProperty("error");
    expect(parseOutcomeBody({ outcome: "job_closed", amount: 0, slot: SLOT })).toHaveProperty("error");
    expect(parseOutcomeBody({ outcome: "job_closed", amount: 100 })).toHaveProperty("error");
    expect(parseOutcomeBody({ outcome: "call_back", date: "2026-10-14", time: "13:30" })).toHaveProperty("error");
    expect(parseOutcomeBody({ outcome: "not_interested", reason: "Nope" })).toHaveProperty("error");
    expect(parseOutcomeBody({ outcome: "sold" })).toHaveProperty("error");
  });

  it("missing form answers come back blank, never undefined", () => {
    const r = parseOutcomeBody({ outcome: "estimate_booked", slot: SLOT });
    expect(r).toMatchObject({ form: { address: "", services: "", notes: "" } });
  });
});

describe("where each answer lands", () => {
  it("maps to board stages, and every reason is Lost (no Trash)", () => {
    expect(stageKeyFor("estimate_booked")).toBe("estimate");
    expect(stageKeyFor("job_closed")).toBe("job");
    expect(stageKeyFor("call_back")).toBe("followUp");
    expect(stageKeyFor("no_answer")).toBe("noAnswer");
    expect(stageKeyFor("not_interested")).toBe("lost");
    expect(lostReasonFor("Went with someone else")).toBe("competitor");
    expect(lostReasonFor("Spam")).toBe("other");
  });

  it("the board knows a No Answer stage by name and gives it a follow-up", () => {
    expect(boardKey("No Answer")).toBe("noAnswer");
    const stages: BoardStage[] = [{ id: "s1", name: "No Answer", color: null, key: "noAnswer" }];
    const plan = planMove(stages, { stageId: "s1", at: "2026-10-11T18:15:00Z", note: "No answer (1)" });
    expect(plan).toMatchObject({ ok: true, followUp: { dueAt: "2026-10-11T18:15:00.000Z" }, closeFollowUp: false });
    expect(planMove(stages, { stageId: "s1" })).toEqual({ ok: false, error: "at_required" });
  });
});

describe("outcomePage", () => {
  it("posts back to the route it was opened on and prefills the form", () => {
    const page = outcomePage({
      name: "Marcus <Bell>",
      booked: "",
      current: "",
      base: "/api/lead-outcome",
      query: "?l=1&c=2&k=3",
      hasJobCalendar: true,
      form: { address: "1 Elm St", services: "", notes: "" },
      days: [{ date: "2026-10-10", label: "Today" }],
      pastToday: [],
      noAnswerAt: "2:15 PM",
    });
    expect(page).toContain('var BASE="/api/lead-outcome"');
    expect(page).toContain("Marcus &#60;Bell&#62;");
    expect(page).toContain('value="1 Elm St"');
    expect(page).toContain("Call again tomorrow at 2:15 PM");
    for (const o of ["estimate_booked", "job_closed", "call_back", "no_answer", "not_interested"]) {
      expect(page).toContain(`data-outcome="${o}"`);
    }
  });

  it("labels times", () => {
    expect(timeLabel("13:00")).toBe("1 PM");
    expect(timeLabel("09:30")).toBe("9:30 AM");
  });
});
