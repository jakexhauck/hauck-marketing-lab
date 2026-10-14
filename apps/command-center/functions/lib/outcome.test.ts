import { describe, expect, it } from "vitest";
import { formAnswerRows, leadInfoRows, lostReasonFor, outcomePage, parseOutcomeBody, stageKeyFor, timeLabel } from "./outcome";
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
    expect(parseOutcomeBody({ outcome: "job_done", amount: "$5,000" })).toEqual({ outcome: "job_done", amountCents: 500000 });
    expect(parseOutcomeBody({ outcome: "job_rescheduled", slot: SLOT })).toEqual({ outcome: "job_rescheduled", slot: SLOT });
    expect(parseOutcomeBody({ outcome: "job_cancelled" })).toEqual({ outcome: "job_cancelled" });
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
    expect(parseOutcomeBody({ outcome: "job_done", amount: 0 })).toHaveProperty("error");
    expect(parseOutcomeBody({ outcome: "job_rescheduled" })).toHaveProperty("error");
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
    expect(stageKeyFor("job_done")).toBe("won");
    expect(stageKeyFor("job_rescheduled")).toBe("job");
    expect(stageKeyFor("job_cancelled")).toBe("cancelled");
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
      job: "",
      jobAmount: null,
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
    expect(page).not.toContain('data-outcome="job_done"');
  });

  it("leads with a Call button and points to the app for texting, no send box", () => {
    const page = outcomePage({
      name: "Marcus Bell",
      booked: "",
      current: "",
      base: "/api/outcome",
      query: "?l=1&c=2&k=3",
      hasJobCalendar: false,
      job: "",
      jobAmount: null,
      form: { address: "", services: "", notes: "" },
      days: [{ date: "2026-10-10", label: "Today" }],
      pastToday: [],
      noAnswerAt: "2:15 PM",
    });
    expect(page).toContain('id="callBtn">Call Marcus</button>');
    expect(page).toContain('action:"call"');
    expect(page).toContain("To Text This Lead Open The Command Center App!");
    expect(page.indexOf("callBtn")).toBeLessThan(page.indexOf('data-outcome="estimate_booked"'));
  });

  it("shows the job answers only once a job is booked, amount prefilled", () => {
    const page = outcomePage({
      name: "Marcus",
      booked: "",
      current: "",
      base: "/api/outcome",
      query: "?l=1&c=2&k=3",
      hasJobCalendar: true,
      job: "Job Tue, Oct 14, 10:00 AM",
      jobAmount: 4200,
      form: { address: "", services: "", notes: "" },
      days: [{ date: "2026-10-10", label: "Today" }],
      pastToday: [],
      noAnswerAt: "2:15 PM",
    });
    for (const o of ["job_done", "job_rescheduled", "job_cancelled"]) {
      expect(page).toContain(`data-outcome="${o}"`);
    }
    expect(page).toContain("Job Tue, Oct 14, 10:00 AM");
    expect(page).toContain('id="doneAmount" inputmode="decimal" placeholder="$0" autocomplete="off" value="4200"');
    expect(page).toContain('data-picker="jobr"');
  });

  it("labels times", () => {
    expect(timeLabel("13:00")).toBe("1 PM");
    expect(timeLabel("09:30")).toBe("9:30 AM");
  });
});

describe("leadInfoRows", () => {
  const names = new Map([
    ["f1", "What do you need help with?"],
    ["f2", "utm_campaign"],
    ["f3", "Door size"],
    ["f4", "Empty one"],
  ]);
  it("lists the contact fields, then every filled custom field by name, no tracking ids", () => {
    const rows = leadInfoRows(
      {
        phone: "+15865550173",
        email: "",
        address1: "1428 Elm St",
        city: "Allen Park",
        state: "MI",
        postalCode: "48101",
        dateAdded: "2026-10-12T13:14:00Z",
        source: "facebook",
        customFields: [
          { id: "f1", value: "New install" },
          { id: "f2", value: "fall-promo" },
          { id: "f3", value: ["16x7", "Insulated"] },
          { id: "f4", value: "" },
          { id: "unknown", value: "x" },
        ],
      },
      names,
      () => "Mon, Oct 12, 9:14 AM",
    );
    expect(rows).toEqual([
      { label: "Phone", value: "(586) 555-0173" },
      { label: "Came in", value: "Mon, Oct 12, 9:14 AM" },
      { label: "Source", value: "facebook" },
      { label: "What do you need help with?", value: "New install" },
      { label: "Door size", value: "16x7, Insulated" },
    ]);
  });
  it("escapes what it shows on the page", () => {
    const page = outcomePage({
      name: "M",
      info: [{ label: "Notes", value: "<b>hi</b>" }],
      booked: "",
      current: "",
      base: "/api/outcome",
      query: "?a=1",
      hasJobCalendar: false,
      job: "",
      jobAmount: null,
      form: { address: "", services: "", notes: "" },
      days: [{ date: "2026-10-10", label: "Today" }],
      pastToday: [],
      noAnswerAt: "2:15 PM",
    });
    expect(page).toContain('<dl class="info">');
    expect(page).not.toContain("<b>hi</b>");
  });
});

describe("formAnswerRows", () => {
  it("turns Meta form keys into questions and leaves the contact keys out", () => {
    expect(
      formAnswerRows({
        full_name: "Marcus Bell",
        phone_number: "+15865550173",
        email: "m@x.com",
        zip_code: "48101",
        "what_type_of_service_do_you_need?": "new_door_install",
        when_do_you_need_it: "",
      }),
    ).toEqual([{ label: "What type of service do you need?", value: "New door install" }]);
    expect(formAnswerRows({ "how_soon?": "asap", "are_you_the_homeowner?": "yes", notes: "Side door, Rusty" })).toEqual([
      { label: "How soon?", value: "ASAP" },
      { label: "Are you the homeowner?", value: "Yes" },
      { label: "Notes", value: "Side door, Rusty" },
    ]);
  });
  it("adds them after the contact rows, skipping a question already shown", () => {
    const rows = leadInfoRows(
      { phone: "5865550173", customFields: [{ id: "f1", value: "Install" }] },
      new Map([["f1", "What type of service do you need?"]]),
      () => "",
      [
        { label: "What type of service do you need?", value: "new door install" },
        { label: "Door size", value: "16x7" },
      ],
    );
    expect(rows.map((r) => r.label)).toEqual(["Phone", "What type of service do you need?", "Door size"]);
  });
});
