import { describe, expect, it } from "vitest";
import { stageActionsFor } from "./setterStageActions";

function tags(stageName: string, pipelineName: string): string[] {
  return (stageActionsFor(stageName, pipelineName)?.actions ?? []).map((a) => a.tag);
}

function labels(stageName: string, pipelineName: string): string[] {
  return (stageActionsFor(stageName, pipelineName)?.actions ?? []).map((a) => a.label);
}

describe("stageActionsFor", () => {
  it("returns null only when the stage name is missing", () => {
    expect(stageActionsFor(null, "1) Lead Form Pipeline")).toBeNull();
    expect(stageActionsFor(undefined, "1) Lead Form Pipeline")).toBeNull();
    expect(stageActionsFor("", "1) Lead Form Pipeline")).toBeNull();
  });

  it("gives every stage the dialing panel, even unlisted ones", () => {
    const cfg = stageActionsFor("Long Term Nurture", "1) Lead Form Pipeline");
    expect(cfg?.dials).toBe(3);
    expect(labels("Long Term Nurture", "1) Lead Form Pipeline")).toEqual([
      "Unqualified",
      "Uninterested",
      "Follow Up",
    ]);
  });

  it("keys the no-answer chain off the stage name, case-insensitively", () => {
    expect(tags("Opted In (needs dialing)", "1) Lead Form Pipeline")).toContain(
      "no answer day 1",
    );
    expect(tags("NO ANSWER DAY 2 (NEEDS DIALING)", "1) Lead Form Pipeline")).toContain(
      "no answer day 3",
    );
  });

  it("drops the No Answer button on day 4", () => {
    expect(labels("No Answer Day 4 (needs dialing)", "1) Lead Form Pipeline")).toEqual([
      "Unqualified",
      "Uninterested",
      "Follow Up",
    ]);
  });

  it("uses the lead form follow-up tag outside the funnel", () => {
    expect(tags("Opted In (needs dialing)", "1) Lead Form Pipeline")).toContain(
      "lead form follow up",
    );
    expect(tags("New Lead", "3) Sales Pipeline")).toContain("lead form follow up");
  });

  it("uses the funnel follow-up tag on every Funnel Pipeline stage", () => {
    expect(
      tags("Survey Completed No Call Booked (needs dialing)", "2) Funnel Pipeline"),
    ).toContain("funnel follow up");
    // The no-answer stages exist verbatim in both pipelines; the funnel's
    // must follow up on the funnel tag.
    expect(tags("No Answer Day 1 (needs dialing)", "2) Funnel Pipeline")).toContain(
      "funnel follow up",
    );
  });

  it("drops the Follow Up button on follow-up stages themselves", () => {
    expect(labels("Opted In Follow Up", "1) Lead Form Pipeline")).toEqual([
      "Unqualified",
      "Uninterested",
    ]);
    expect(labels("Survey Follow Up", "2) Funnel Pipeline")).toEqual([
      "Unqualified",
      "Uninterested",
    ]);
  });

  it("starts the survey stage's no-answer chain at day 1", () => {
    expect(
      tags("Survey Completed No Call Booked (needs dialing)", "2) Funnel Pipeline"),
    ).toContain("no answer day 1");
  });

  it("gives Phone Appt Confirmed the SOP's on-call buttons", () => {
    const cfg = stageActionsFor("Phone Appt Confirmed", "2) Funnel Pipeline");
    expect(cfg?.actions.map((a) => [a.label, a.tag])).toEqual([
      ["Unqualified", "services unqualified"],
      ["Uninterested", "services uninterested"],
      ["Reschedule", "cancelled-call-rescheduling"],
      ["Cancel + Follow Up", "cancelled-call-follow-up"],
    ]);
    const reschedule = cfg?.actions.find((a) => a.label === "Reschedule");
    expect(reschedule?.cancelAppointment).toBe(true);
    expect(reschedule?.bookAfter).toBe(true);
    expect(reschedule?.promptTask).toBeUndefined();
    const cancel = cfg?.actions.find((a) => a.label === "Cancel + Follow Up");
    expect(cancel?.cancelAppointment).toBe(true);
    expect(cancel?.promptTask).toBe(true);
    expect(cancel?.bookAfter).toBeUndefined();
  });

  it("prompts a task only on Follow Up", () => {
    const cfg = stageActionsFor("Opted In (needs dialing)", "1) Lead Form Pipeline");
    const prompts = (cfg?.actions ?? []).filter((a) => a.promptTask).map((a) => a.label);
    expect(prompts).toEqual(["Follow Up"]);
  });
});
