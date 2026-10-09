import { describe, expect, it } from "vitest";
import {
  currentLabel,
  outcomePage,
  parseOutcomeBody,
  pickEstimateAppointment,
  slotDate,
  slotEnd,
  stageForOutcome,
} from "./estimateOutcome";

const SLOT = "2026-10-14T09:00:00-04:00";

describe("parseOutcomeBody", () => {
  it("a Sold needs an amount and a job time", () => {
    expect(parseOutcomeBody({ outcome: "sold", amount: 4500, slot: SLOT })).toEqual({
      outcome: "sold",
      amountCents: 450000,
      reason: null,
      slot: SLOT,
    });
    expect(parseOutcomeBody({ outcome: "sold", amount: "$4,500.50", slot: SLOT })).toMatchObject({
      amountCents: 450050,
    });
    expect(parseOutcomeBody({ outcome: "sold", amount: 4500 })).toEqual({ error: "Pick a time for the job." });
    expect(parseOutcomeBody({ outcome: "sold", amount: 0, slot: SLOT })).toEqual({ error: "Enter the job amount." });
    expect(parseOutcomeBody({ outcome: "sold", amount: 5_000_000, slot: SLOT })).toEqual({
      error: "That amount looks too big.",
    });
  });

  it("a Not sold needs one of the listed reasons", () => {
    expect(parseOutcomeBody({ outcome: "not_sold", reason: "Price" })).toMatchObject({ reason: "Price" });
    expect(parseOutcomeBody({ outcome: "not_sold", reason: "<script>" })).toEqual({ error: "Pick a reason." });
  });

  it("a Rescheduled needs a well-formed time; a No-show needs nothing", () => {
    expect(parseOutcomeBody({ outcome: "rescheduled", slot: "tomorrow" })).toEqual({
      error: "Pick the new estimate time.",
    });
    expect(parseOutcomeBody({ outcome: "rescheduled", slot: SLOT })).toMatchObject({ slot: SLOT });
    expect(parseOutcomeBody({ outcome: "no_show" })).toEqual({
      outcome: "no_show",
      amountCents: null,
      reason: null,
      slot: null,
    });
  });

  it("rejects anything else", () => {
    expect(parseOutcomeBody(null)).toEqual({ error: "Pick what happened." });
    expect(parseOutcomeBody({ outcome: "won" })).toEqual({ error: "Pick what happened." });
  });
});

describe("pickEstimateAppointment", () => {
  const now = Date.parse("2026-10-09T18:00:00Z");
  const appts = [
    { id: "old", calendarId: "est", startTime: "2026-09-01T14:00:00Z", status: "showed" },
    { id: "today", calendarId: "est", startTime: "2026-10-09T16:00:00Z", status: "confirmed" },
    { id: "next", calendarId: "est", startTime: "2026-10-20T16:00:00Z", status: "confirmed" },
    { id: "job", calendarId: "job", startTime: "2026-10-09T17:00:00Z", status: "confirmed" },
    { id: "gone", calendarId: "est", startTime: "2026-10-09T17:30:00Z", status: "confirmed", deleted: true },
  ];

  it("takes the estimate that started most recently, on the estimate calendar only", () => {
    expect(pickEstimateAppointment(appts, "est", now)?.id).toBe("today");
  });

  it("falls back to the next one when none has started", () => {
    expect(pickEstimateAppointment(appts, "est", Date.parse("2026-08-01T00:00:00Z"))?.id).toBe("old");
    expect(pickEstimateAppointment(appts.slice(2), "est", now)?.id).toBe("next");
  });

  it("honours an id from the link only when it is this contact's estimate", () => {
    expect(pickEstimateAppointment(appts, "est", now, "old")?.id).toBe("old");
    expect(pickEstimateAppointment(appts, "est", now, "job")?.id).toBe("today");
  });

  it("prefers a live estimate over a cancelled one", () => {
    const got = pickEstimateAppointment(
      [
        { id: "x", calendarId: "est", startTime: "2026-10-09T17:00:00Z", status: "cancelled" },
        { id: "y", calendarId: "est", startTime: "2026-10-08T17:00:00Z", status: "confirmed" },
      ],
      "est",
      now,
    );
    expect(got?.id).toBe("y");
  });

  it("is null with no estimate at all", () => {
    expect(pickEstimateAppointment([appts[3]], "est", now)).toBeNull();
  });
});

describe("slots and stages", () => {
  it("ends a booking on the calendar's slot length, else an hour", () => {
    expect(slotEnd("2026-10-14T13:00:00Z", 90, "mins")).toBe("2026-10-14T14:30:00.000Z");
    expect(slotEnd("2026-10-14T13:00:00Z", 2, "hours")).toBe("2026-10-14T15:00:00.000Z");
    expect(slotEnd("2026-10-14T13:00:00Z")).toBe("2026-10-14T14:00:00.000Z");
    expect(slotDate(SLOT)).toBe("2026-10-14");
  });

  it("moves the card by outcome, and leaves a no-show where it is", () => {
    expect(stageForOutcome("sold")).toEqual({ stage: "Job Booked" });
    expect(stageForOutcome("not_sold")).toEqual({ stage: "Lost", status: "lost" });
    expect(stageForOutcome("rescheduled")).toEqual({ stage: "Estimate Booked" });
    expect(stageForOutcome("no_show")).toBeNull();
  });
});

describe("the page", () => {
  it("escapes the lead's name and shows what was already chosen", () => {
    const html = outcomePage({
      name: `<img src=x onerror=alert(1)>`,
      when: "Thu, Oct 9, 2:00 PM",
      current: { outcome: "sold", amountCents: 450000, reason: null },
      query: "?l=a&c=b&k=c",
      hasJobCalendar: true,
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("Sold $4,500");
    expect(html).toContain('data-picker="job"');
  });

  it("labels each saved outcome", () => {
    expect(currentLabel({ outcome: "not_sold", amountCents: null, reason: "Price" })).toBe("Not sold: Price");
    expect(currentLabel({ outcome: "no_show", amountCents: null, reason: null })).toBe("No-show");
    expect(currentLabel(null)).toBe("");
  });
});
