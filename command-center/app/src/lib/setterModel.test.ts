import { describe, it, expect } from "vitest";
import {
  isStaleUncontacted,
  cardRail,
  formatOutcome,
  staleWaitingLabel,
  ghlContactUrl,
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
