import { describe, it, expect } from "vitest";
import {
  isStaleUncontacted,
  cardRail,
  formatOutcome,
  orderByNumberPrefix,
  stageTone,
  staleWaitingLabel,
  ghlContactUrl,
  ghlConversationsUrl,
  speedToLead,
  medianSpeedToLeadMs,
  formatStlDuration,
  isNoAnswerStage,
  noAnswerWait,
} from "./setterModel";

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

describe("staleWaitingLabel", () => {
  it("renders whole hours under a day", () => {
    expect(staleWaitingLabel(new Date(NOW - 20 * 60 * 60 * 1000).toISOString(), NOW)).toBe(
      "Waiting 20h",
    );
  });

  it("renders whole days at a day or more", () => {
    expect(staleWaitingLabel(new Date(NOW - 3 * DAY).toISOString(), NOW)).toBe("Waiting 3d");
  });

  it("falls back to a bare label on an unparseable date", () => {
    expect(staleWaitingLabel("not-a-date", NOW)).toBe("Waiting");
  });
});

describe("orderByNumberPrefix", () => {
  it("sorts by the numeric prefix regardless of fetched order", () => {
    const input = [
      { name: "6) Trash Pipeline" },
      { name: "2) Funnel Pipeline" },
      { name: "1) Lead Form Pipeline" },
      { name: "10) Overflow Pipeline" },
    ];
    expect(orderByNumberPrefix(input).map((p) => p.name)).toEqual([
      "1) Lead Form Pipeline",
      "2) Funnel Pipeline",
      "6) Trash Pipeline",
      "10) Overflow Pipeline",
    ]);
  });

  it("puts unnumbered pipelines after the numbered ones, keeping their order", () => {
    const input = [
      { name: "Zeta" },
      { name: "2) Funnel Pipeline" },
      { name: "Alpha" },
      { name: "1) Lead Form Pipeline" },
    ];
    expect(orderByNumberPrefix(input).map((p) => p.name)).toEqual([
      "1) Lead Form Pipeline",
      "2) Funnel Pipeline",
      "Zeta",
      "Alpha",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [{ name: "2) B" }, { name: "1) A" }];
    orderByNumberPrefix(input);
    expect(input.map((p) => p.name)).toEqual(["2) B", "1) A"]);
  });
});

describe("stageTone", () => {
  it("maps the live TEST ACCOUNT stages to their semantic tones", () => {
    expect(stageTone("Opted In (needs dialing)")).toBe("var(--brand)");
    expect(stageTone("Survey Completed No Call Booked (needs dialing)")).toBe("var(--brand)");
    expect(stageTone("No Answer Day 2 (needs dialing)")).toBe("var(--warning)");
    expect(stageTone("Opted In Follow Up")).toBe("#8b5cf6");
    expect(stageTone("Survey Follow Up")).toBe("#8b5cf6");
    expect(stageTone("Phone Appt Booked")).toBe("var(--positive)");
    expect(stageTone("Phone Appt Confirmed")).toBe("var(--positive)");
    expect(stageTone("Long Term Nurture")).toBe("var(--text-faint)");
  });

  it("marks dead ends red", () => {
    expect(stageTone("Trash")).toBe("var(--danger)");
    expect(stageTone("Services Unqualified")).toBe("var(--danger)");
    expect(stageTone("Cancelled Appointments")).toBe("var(--danger)");
  });

  it("defaults unknown stages to the brand tone", () => {
    expect(stageTone("Some Brand New Stage")).toBe("var(--brand)");
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

describe("ghlContactUrl", () => {
  it("builds the contact detail URL from a location and contact id", () => {
    expect(ghlContactUrl("loc_abc123", "cont_xyz789")).toBe(
      "https://app.gohighlevel.com/v2/location/loc_abc123/contacts/detail/cont_xyz789",
    );
  });

  // Returning null rather than a half-built URL is the whole point: it is the
  // single signal the cockpit branches on to render plain text instead of a
  // link that would land the setter on a CRM 404 mid-dial.
  it("returns null when the location id is missing", () => {
    expect(ghlContactUrl("", "cont_xyz789")).toBeNull();
  });

  it("returns null when the contact id is missing", () => {
    expect(ghlContactUrl("loc_abc123", "")).toBeNull();
  });

  it("returns null on whitespace-only input", () => {
    expect(ghlContactUrl("   ", "cont_xyz789")).toBeNull();
    expect(ghlContactUrl("loc_abc123", "  ")).toBeNull();
  });

  it("encodes both segments so a stray id character cannot break the path", () => {
    expect(ghlContactUrl("loc/../evil", "cont?x=1")).toBe(
      "https://app.gohighlevel.com/v2/location/loc%2F..%2Fevil/contacts/detail/cont%3Fx%3D1",
    );
  });
});

describe("speedToLead", () => {
  const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

  it("is null once the lead has been dialed", () => {
    expect(speedToLead(at(10 * 60 * 1000), NOW, true)).toBeNull();
  });

  it("is null for an unparseable timestamp", () => {
    expect(speedToLead("not-a-date", NOW, false)).toBeNull();
  });

  it("is green in minutes under 5 minutes", () => {
    expect(speedToLead(at(3 * 60 * 1000), NOW, false)).toEqual({ label: "3m", tone: "positive" });
  });

  it("turns amber at exactly 5 minutes", () => {
    expect(speedToLead(at(5 * 60 * 1000), NOW, false)).toEqual({ label: "5m", tone: "warning" });
  });

  it("stays amber in minutes up to an hour", () => {
    expect(speedToLead(at(47 * 60 * 1000), NOW, false)).toEqual({ label: "47m", tone: "warning" });
  });

  it("turns red at an hour and reads in hours", () => {
    expect(speedToLead(at(60 * 60 * 1000), NOW, false)).toEqual({ label: "1h", tone: "danger" });
  });

  it("reads in days past 24 hours", () => {
    expect(speedToLead(at(2 * DAY + 60 * 60 * 1000), NOW, false)).toEqual({ label: "2d", tone: "danger" });
  });

  it("clamps a future createdAt (clock skew) to zero", () => {
    expect(speedToLead(at(-30 * 1000), NOW, false)).toEqual({ label: "0m", tone: "positive" });
  });
});

describe("medianSpeedToLeadMs", () => {
  const MIN = 60 * 1000;
  const mk = (createdAgoMs: number, dialedAgoMs: number | null) => ({
    createdAt: new Date(NOW - createdAgoMs).toISOString(),
    firstDialedAt: dialedAgoMs === null ? null : new Date(NOW - dialedAgoMs).toISOString(),
  });

  it("is null when no lead has been dialed in the window", () => {
    expect(medianSpeedToLeadMs([mk(60 * MIN, null)], 0)).toBeNull();
  });

  it("takes the middle value of an odd sample set", () => {
    const leads = [
      mk(10 * MIN, 8 * MIN), // 2m
      mk(30 * MIN, 10 * MIN), // 20m
      mk(90 * MIN, 30 * MIN), // 60m
    ];
    expect(medianSpeedToLeadMs(leads, 0)).toBe(20 * MIN);
  });

  it("averages the middle pair of an even sample set", () => {
    const leads = [
      mk(10 * MIN, 8 * MIN), // 2m
      mk(30 * MIN, 26 * MIN), // 4m
      mk(40 * MIN, 30 * MIN), // 10m
      mk(90 * MIN, 30 * MIN), // 60m
    ];
    expect(medianSpeedToLeadMs(leads, 0)).toBe(7 * MIN);
  });

  it("excludes leads whose first dial predates the window", () => {
    const leads = [
      mk(10 * MIN, 8 * MIN), // in window: 2m
      mk(500 * MIN, 400 * MIN), // first dialed before sinceMs
    ];
    expect(medianSpeedToLeadMs(leads, NOW - 60 * MIN)).toBe(2 * MIN);
  });

  it("clamps a first dial recorded before the lead's createdAt to zero", () => {
    expect(medianSpeedToLeadMs([mk(5 * MIN, 10 * MIN)], 0)).toBe(0);
  });
});

describe("formatStlDuration", () => {
  it("formats minutes, hours, then days", () => {
    expect(formatStlDuration(4 * 60 * 1000)).toBe("4m");
    expect(formatStlDuration(3 * 60 * 60 * 1000)).toBe("3h");
    expect(formatStlDuration(2 * DAY + 60 * 60 * 1000)).toBe("2d");
  });
});

describe("isNoAnswerStage", () => {
  it("matches every stage of the live no-answer chain", () => {
    expect(isNoAnswerStage("No Answer Day 1 (needs dialing)")).toBe(true);
    expect(isNoAnswerStage("no answer day 4 (needs dialing)")).toBe(true);
  });

  it("does not match other stages or missing names", () => {
    expect(isNoAnswerStage("Opted In (needs dialing)")).toBe(false);
    expect(isNoAnswerStage(undefined)).toBe(false);
    expect(isNoAnswerStage(null)).toBe(false);
  });
});

describe("noAnswerWait", () => {
  const HOUR = 60 * 60 * 1000;
  const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

  it("is null for an unparseable timestamp", () => {
    expect(noAnswerWait("garbage", NOW)).toBeNull();
  });

  it("counts up in minutes, then hours, not yet due", () => {
    expect(noAnswerWait(at(40 * 60 * 1000), NOW)).toEqual({ label: "40m", due: false });
    expect(noAnswerWait(at(18 * HOUR), NOW)).toEqual({ label: "18h", due: false });
  });

  it("flips due at exactly 24 hours", () => {
    expect(noAnswerWait(at(24 * HOUR), NOW)).toEqual({ label: "1d", due: true });
  });

  it("reads days plus hours once past a day", () => {
    expect(noAnswerWait(at(27 * HOUR), NOW)).toEqual({ label: "1d 3h", due: true });
  });

  it("clamps a future timestamp (clock skew) to zero, not due", () => {
    expect(noAnswerWait(at(-5 * 60 * 1000), NOW)).toEqual({ label: "0m", due: false });
  });
});

describe("ghlConversationsUrl", () => {
  it("builds the conversations URL for a location", () => {
    expect(ghlConversationsUrl("loc_abc123")).toBe(
      "https://app.gohighlevel.com/v2/location/loc_abc123/conversations/conversations",
    );
  });

  it("returns null when the location id is missing or blank", () => {
    expect(ghlConversationsUrl("")).toBeNull();
    expect(ghlConversationsUrl("   ")).toBeNull();
  });
});
