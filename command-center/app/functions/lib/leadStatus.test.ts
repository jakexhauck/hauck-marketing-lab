import { describe, expect, it } from "vitest";
import {
  CLIENT_STATUS_ORDER,
  furthestStatus,
  statusForStage,
  type ClientLeadStatus,
} from "./leadStatus";

// Every stage below was pulled live from Willis's GHL on 2026-07-24. If a test
// here fails because a stage was renamed, fix the map, not the test.

describe("statusForStage", () => {
  it("maps the Lead Form pipeline", () => {
    expect(statusForStage("Opted In (needs dialing)")).toBe("new");
    expect(statusForStage("Opted In Follow Up")).toBe("contacted");
    expect(statusForStage("Long Term Nurture")).toBe("long_term_nurture");
  });

  it("maps every No Answer Day stage to one Phone Follow Up status", () => {
    for (const day of [1, 2, 3, 4]) {
      expect(statusForStage(`No Answer Day ${day} (needs dialing)`)).toBe("phone_follow_up");
    }
  });

  it("keeps mapping No Answer stages Jake adds later", () => {
    // The cadence is expected to grow; the map must not need a new entry.
    expect(statusForStage("No Answer Day 9 (needs dialing)")).toBe("phone_follow_up");
  });

  it("maps the Funnel pipeline", () => {
    expect(statusForStage("Survey Completed No Call Booked (needs dialing)")).toBe("new");
    expect(statusForStage("Survey Follow Up")).toBe("contacted");
    expect(statusForStage("Phone Appt Booked")).toBe("phone_appt_booked");
    expect(statusForStage("Phone Appt Confirmed")).toBe("phone_appt_confirmed");
  });

  it("maps the Sales pipeline", () => {
    expect(statusForStage("Handed Off")).toBe("handed_off");
    expect(statusForStage("Estimate Booked")).toBe("estimate_booked");
    expect(statusForStage("Job Booked")).toBe("job_booked");
    expect(statusForStage("Won")).toBe("won");
    expect(statusForStage("Won Recurring")).toBe("won");
    expect(statusForStage("Follow Up")).toBe("follow_up");
  });

  it("maps the Cancelled Appointments pipeline to Phone Follow Up", () => {
    // A fallen-through appointment is a lead we are chasing again, not a booking.
    expect(statusForStage("Phone Appt Follow Up")).toBe("phone_follow_up");
    expect(statusForStage("Phone Appt Rescheduling")).toBe("phone_follow_up");
    expect(statusForStage("Phone Appt Unspecified")).toBe("phone_follow_up");
  });

  it("does not let the Sales 'Follow Up' key swallow the cancelled-appt stages", () => {
    expect(statusForStage("Phone Appt Follow Up")).not.toBe("follow_up");
  });

  it("maps the Trash pipeline", () => {
    expect(statusForStage("Services Uninterested")).toBe("lost");
    expect(statusForStage("Services Unqualified")).toBe("lost");
    expect(statusForStage("Bad Intent")).toBe("lost");
    expect(statusForStage("Lost")).toBe("lost");
  });

  it("survives emoji and double spaces in stage names", () => {
    expect(statusForStage("Phone Appt Confirmed  \u{1F4DE}")).toBe("phone_appt_confirmed");
    expect(statusForStage("Long Term Nurture \u{1F331}")).toBe("long_term_nurture");
  });

  it("falls back to New for an unknown or empty stage", () => {
    // Never invent progress for a stage the map has not seen.
    expect(statusForStage("Some Brand New Stage")).toBe("new");
    expect(statusForStage("")).toBe("new");
  });
});

describe("furthestStatus", () => {
  it("takes the furthest card when a contact spans pipelines", () => {
    expect(furthestStatus(["new", "estimate_booked", "phone_follow_up"])).toBe("estimate_booked");
  });

  it("prefers a live appointment over an old no-answer card", () => {
    expect(furthestStatus(["phone_follow_up", "phone_appt_confirmed"])).toBe(
      "phone_appt_confirmed",
    );
  });

  it("prefers nurture over a bare new card", () => {
    expect(furthestStatus(["new", "long_term_nurture"])).toBe("long_term_nurture");
  });

  it("lets a real sale outrank a stale Trash card", () => {
    // Sold outranks lost: a paying customer with a stale Trash card is a
    // customer, not a loss. Same rule the 5-bucket model used.
    expect(furthestStatus(["lost", "won"])).toBe("won");
  });

  it("keeps Lost when the lead never got past the early stages", () => {
    expect(furthestStatus(["new", "phone_follow_up", "lost"])).toBe("lost");
  });

  it("returns New for an empty list", () => {
    expect(furthestStatus([])).toBe("new");
  });
});

describe("CLIENT_STATUS_ORDER", () => {
  it("lists all twelve statuses exactly once", () => {
    expect(CLIENT_STATUS_ORDER).toHaveLength(12);
    expect(new Set(CLIENT_STATUS_ORDER).size).toBe(12);
  });

  it("covers every status the map can produce", () => {
    const produced = new Set<ClientLeadStatus>(
      [
        "Opted In (needs dialing)",
        "Opted In Follow Up",
        "No Answer Day 1 (needs dialing)",
        "Long Term Nurture",
        "Phone Appt Booked",
        "Phone Appt Confirmed",
        "Handed Off",
        "Estimate Booked",
        "Job Booked",
        "Won",
        "Follow Up",
        "Lost",
      ].map(statusForStage),
    );
    expect(produced.size).toBe(12);
    for (const s of produced) expect(CLIENT_STATUS_ORDER).toContain(s);
  });
});
