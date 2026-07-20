import { describe, it, expect } from "vitest";
import { needsDialing, isStaleUncontacted, cardRail, formatOutcome } from "./setterModel";

describe("needsDialing", () => {
  it("matches the live stage names case-insensitively", () => {
    expect(needsDialing("Opted In (needs dialing)")).toBe(true);
    expect(needsDialing("No Answer Day 4 (Needs Dialing)")).toBe(true);
  });
  it("does not match stages without the marker", () => {
    expect(needsDialing("Long Term Nurture")).toBe(false);
    expect(needsDialing("Estimate Booked")).toBe(false);
  });
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-07-20T12:00:00Z").getTime();

describe("isStaleUncontacted", () => {
  it("is false when the stage does not need dialing", () => {
    expect(
      isStaleUncontacted(
        { attempts: 2, contacted: false, createdAt: new Date(NOW - 2 * DAY).toISOString() },
        false,
        NOW,
      ),
    ).toBe(false);
  });

  it("is false once the lead has been contacted, no matter how old", () => {
    expect(
      isStaleUncontacted(
        { attempts: 2, contacted: true, createdAt: new Date(NOW - 5 * DAY).toISOString() },
        true,
        NOW,
      ),
    ).toBe(false);
  });

  it("is false under 24 hours old", () => {
    expect(
      isStaleUncontacted(
        { attempts: 1, contacted: false, createdAt: new Date(NOW - 3 * 60 * 60 * 1000).toISOString() },
        true,
        NOW,
      ),
    ).toBe(false);
  });

  it("is true past 24 hours, uncontacted, in a needs-dialing stage", () => {
    expect(
      isStaleUncontacted(
        { attempts: 3, contacted: false, createdAt: new Date(NOW - 2 * DAY).toISOString() },
        true,
        NOW,
      ),
    ).toBe(true);
  });
});

describe("cardRail", () => {
  it("is danger for a lead with zero attempts, regardless of stage or age", () => {
    expect(
      cardRail({ attempts: 0, contacted: false, createdAt: new Date(NOW).toISOString() }, false, NOW),
    ).toBe("danger");
  });

  it("danger outranks warning when both conditions hold", () => {
    expect(
      cardRail(
        { attempts: 0, contacted: false, createdAt: new Date(NOW - 2 * DAY).toISOString() },
        true,
        NOW,
      ),
    ).toBe("danger");
  });

  it("is warning for a dialed-but-stale lead in a needs-dialing stage", () => {
    expect(
      cardRail(
        { attempts: 2, contacted: false, createdAt: new Date(NOW - 2 * DAY).toISOString() },
        true,
        NOW,
      ),
    ).toBe("warning");
  });

  it("is null for a dialed, contacted, or fresh lead", () => {
    expect(
      cardRail(
        { attempts: 2, contacted: true, createdAt: new Date(NOW - 2 * DAY).toISOString() },
        true,
        NOW,
      ),
    ).toBeNull();
    expect(
      cardRail(
        { attempts: 1, contacted: false, createdAt: new Date(NOW).toISOString() },
        true,
        NOW,
      ),
    ).toBeNull();
  });
});

describe("formatOutcome", () => {
  it("title-cases the underscore-separated enum", () => {
    expect(formatOutcome("no_answer")).toBe("No Answer");
    expect(formatOutcome("not_interested")).toBe("Not Interested");
    expect(formatOutcome("booked")).toBe("Booked");
    expect(formatOutcome("bad_lead")).toBe("Bad Lead");
  });
});
