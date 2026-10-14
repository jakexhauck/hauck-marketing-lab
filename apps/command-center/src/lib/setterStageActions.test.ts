import { describe, expect, it } from "vitest";
import { followUpTagFor, isDialingPipeline, stageActionsFor } from "./setterStageActions";

const LEADS = "1) Leads";
const NO_ANSWER = "2) No Answer";

function tags(stageName: string, pipelineName: string, leadTags?: string[]): string[] {
  return (stageActionsFor(stageName, pipelineName, leadTags)?.actions ?? []).map((a) => a.tag);
}

function labels(stageName: string, pipelineName: string, leadTags?: string[]): string[] {
  return (stageActionsFor(stageName, pipelineName, leadTags)?.actions ?? []).map((a) => a.label);
}

describe("isDialingPipeline", () => {
  it("accepts the two pipelines a setter works", () => {
    expect(isDialingPipeline(LEADS)).toBe(true);
    expect(isDialingPipeline(NO_ANSWER)).toBe(true);
  });

  it("rejects every pipeline that is not setter work", () => {
    for (const p of ["3) Sales", "4) Trash", "Google Reviews", "Reactivation", "Organic", "News Channel"]) {
      expect(isDialingPipeline(p)).toBe(false);
    }
  });
});

describe("stageActionsFor", () => {
  it("returns null when the stage name is missing", () => {
    expect(stageActionsFor(null, LEADS)).toBeNull();
    expect(stageActionsFor(undefined, LEADS)).toBeNull();
    expect(stageActionsFor("", LEADS)).toBeNull();
  });

  it("returns null outside the dialing pipelines, so Sales and Trash keep the generic cockpit", () => {
    expect(stageActionsFor("Won", "3) Sales")).toBeNull();
    expect(stageActionsFor("Job Booked", "3) Sales")).toBeNull();
    expect(stageActionsFor("Services Uninterested", "4) Trash")).toBeNull();
    expect(stageActionsFor("Asked For Review", "Google Reviews")).toBeNull();
  });

  it("walks the no-answer chain one day per press, all seven days", () => {
    expect(tags("Lead Form Opt In", LEADS)).toContain("no answer day 1");
    expect(tags("Funnel Opt In", LEADS)).toContain("no answer day 1");
    expect(tags("Lead Follow Up", LEADS)).toContain("no answer day 1");
    for (let day = 1; day <= 6; day++) {
      expect(tags(`No Answer Day ${day}`, NO_ANSWER)).toContain(`no answer day ${day + 1}`);
    }
  });

  it("matches stage names case-insensitively", () => {
    expect(tags("NO ANSWER DAY 2", NO_ANSWER)).toContain("no answer day 3");
  });

  it("ends the chain at day 7 rather than inventing a day 8", () => {
    expect(labels("No Answer Day 7", NO_ANSWER)).toEqual([
      "Unqualified",
      "Uninterested",
      "Follow Up",
    ]);
  });

  it("gives the parking stages no No Answer button", () => {
    expect(labels("Slow Burn", LEADS)).toEqual(["Unqualified", "Uninterested", "Follow Up"]);
    expect(labels("Long Term Nurture", LEADS)).toEqual([
      "Unqualified",
      "Uninterested",
      "Follow Up",
    ]);
  });

  it("drops the Follow Up button on a follow-up stage, keeping its No Answer", () => {
    expect(labels("Lead Follow Up", LEADS)).toEqual([
      "Unqualified",
      "Uninterested",
      "No Answer",
    ]);
  });

  it("prompts a task only on Follow Up", () => {
    const cfg = stageActionsFor("Lead Form Opt In", LEADS);
    expect((cfg?.actions ?? []).filter((a) => a.promptTask).map((a) => a.label)).toEqual([
      "Follow Up",
    ]);
  });

  it("gives the Phone Appt stage the SOP's on-call buttons, with the live tag names", () => {
    const cfg = stageActionsFor("Phone Appt", LEADS);
    expect(cfg?.actions.map((a) => [a.label, a.tag])).toEqual([
      ["Unqualified", "services unqualified"],
      ["Uninterested", "cancelled appointment uninterested"],
      ["Reschedule", "cancelled appointment rescheduling"],
      ["Cancel + Follow Up", "cancelled appointment follow up"],
    ]);
    const reschedule = cfg?.actions.find((a) => a.label === "Reschedule");
    expect(reschedule?.bookAfter).toBe(true);
    expect(reschedule?.promptTask).toBeUndefined();
    const cancel = cfg?.actions.find((a) => a.label === "Cancel + Follow Up");
    expect(cancel?.promptTask).toBe(true);
    expect(cancel?.bookAfter).toBeUndefined();
  });

  it("leaves the appointment cancel to the automation, except for Unqualified", () => {
    const cfg = stageActionsFor("Phone Appt", LEADS);
    const cancels = (cfg?.actions ?? []).filter((a) => a.cancelAppointment).map((a) => a.label);
    expect(cancels).toEqual(["Unqualified"]);
  });
});

describe("followUpTagFor", () => {
  it("reads the origin off the contact's own tags, not the pipeline", () => {
    expect(followUpTagFor("No Answer Day 3", ["funnel survey completed"])).toBe(
      "funnel follow up",
    );
    expect(followUpTagFor("No Answer Day 3", ["lead form"])).toBe("lead form follow up");
  });

  it("falls back to the stage name when the lead carries no origin tag", () => {
    expect(followUpTagFor("Funnel Opt In")).toBe("funnel follow up");
    expect(followUpTagFor("Lead Form Opt In")).toBe("lead form follow up");
  });

  it("defaults to the lead form when nothing says otherwise", () => {
    expect(followUpTagFor("No Answer Day 1", [])).toBe("lead form follow up");
    expect(followUpTagFor("Slow Burn")).toBe("lead form follow up");
  });

  it("is what a funnel lead in the No Answer pipeline gets", () => {
    expect(tags("No Answer Day 2", NO_ANSWER, ["funnel survey completed"])).toContain(
      "funnel follow up",
    );
  });
});
