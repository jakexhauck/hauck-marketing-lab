import { describe, expect, it } from "vitest";
import { leadPage, parseLeadBody, stageForLead, timeLabel, upcomingEstimate } from "./leadOutcome";

const SLOT = "2026-10-14T09:00:00-04:00";

describe("parseLeadBody", () => {
  it("an estimate needs a real slot", () => {
    expect(parseLeadBody({ outcome: "estimate_booked", slot: SLOT })).toEqual({ outcome: "estimate_booked", slot: SLOT });
    expect(parseLeadBody({ outcome: "estimate_booked", slot: "soon" })).toEqual({ error: "Pick a time for the estimate." });
  });

  it("a call-back needs a day and one of the offered times", () => {
    expect(parseLeadBody({ outcome: "call_back", date: "2026-10-10", time: "13:00" })).toEqual({
      outcome: "call_back",
      date: "2026-10-10",
      time: "13:00",
    });
    expect(parseLeadBody({ outcome: "call_back", date: "2026-10-10", time: "13:30" })).toEqual({
      error: "Pick a day and time.",
    });
    expect(parseLeadBody({ outcome: "call_back", date: "tomorrow", time: "13:00" })).toEqual({
      error: "Pick a day and time.",
    });
  });

  it("not interested needs a listed reason; anything else is refused", () => {
    expect(parseLeadBody({ outcome: "not_interested", reason: "Spam" })).toEqual({ outcome: "not_interested", reason: "Spam" });
    expect(parseLeadBody({ outcome: "not_interested", reason: "meh" })).toEqual({ error: "Pick a reason." });
    expect(parseLeadBody({ outcome: "won" })).toEqual({ error: "Pick what happened." });
  });
});

describe("stageForLead", () => {
  it("routes each outcome, and keeps junk out of Lost", () => {
    expect(stageForLead({ outcome: "estimate_booked", slot: SLOT })).toEqual({ stage: "Estimate Booked" });
    expect(stageForLead({ outcome: "call_back", date: "2026-10-10", time: "09:00" })).toEqual({ stage: "Follow Up" });
    expect(stageForLead({ outcome: "not_interested", reason: "Too expensive" })).toEqual({ stage: "Lost", status: "lost" });
    expect(stageForLead({ outcome: "not_interested", reason: "Wrong number" })).toEqual({ stage: "Trash" });
  });
});

describe("upcomingEstimate", () => {
  const now = Date.parse("2026-10-09T18:00:00Z");
  it("finds the next live estimate on the estimate calendar only", () => {
    const got = upcomingEstimate(
      [
        { id: "past", calendarId: "est", startTime: "2026-10-08T14:00:00Z", status: "confirmed" },
        { id: "later", calendarId: "est", startTime: "2026-10-20T14:00:00Z", status: "confirmed" },
        { id: "soon", calendarId: "est", startTime: "2026-10-12T14:00:00Z", status: "confirmed" },
        { id: "off", calendarId: "est", startTime: "2026-10-11T14:00:00Z", status: "cancelled" },
        { id: "job", calendarId: "job", startTime: "2026-10-10T14:00:00Z", status: "confirmed" },
      ],
      "est",
      now,
    );
    expect(got?.id).toBe("soon");
    expect(upcomingEstimate([], "est", now)).toBeNull();
  });
});

describe("the page", () => {
  it("escapes the name, labels times and shows no call button", () => {
    const html = leadPage({
      name: `<b>Bob</b>`,
      current: "",
      booked: "Estimate Tue, Oct 14, 9:00 AM",
      query: "?l=a&c=b&k=c",
      days: [{ date: "2026-10-09", label: "Today" }],
      pastToday: ["09:00"],
    });
    expect(html).not.toContain("<b>Bob</b>");
    expect(html).toContain("Estimate Tue, Oct 14, 9:00 AM");
    expect(html).not.toMatch(/call now/i);
    expect(timeLabel("09:00")).toBe("9 AM");
    expect(timeLabel("13:00")).toBe("1 PM");
  });
});
