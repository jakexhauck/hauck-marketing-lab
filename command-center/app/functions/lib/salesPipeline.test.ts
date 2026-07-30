import { describe, expect, it } from "vitest";
import {
  BOOKING_ROUTE,
  STALE_AFTER_DAYS,
  daysStill,
  findStage,
  isStale,
  missingStages,
  normalizeStageName,
  pickSalesPipeline,
  requiredStages,
  routeFor,
  SALES_STAGES,
} from "./salesPipeline";

// The live board on 2026-07-29, with the Follow Up stage Jake is adding for the
// follow-up button. Note the tail on "Not Interested/Unqualified": the plan
// called it "Not Interested", which is the whole reason findStage tolerates a
// suffix.
const LIVE_STAGES = [
  { id: "1540", name: "Demo Call Booked" },
  { id: "b753", name: "Not Interested/Unqualified" },
  { id: "c3da", name: "No-Show" },
  { id: "f001", name: "Follow Up" },
  { id: "cl01", name: "Closed" },
  { id: "on01", name: "Onboarding Call Booked" },
  { id: "2397", name: "New Client" },
];

describe("routeFor", () => {
  // NOTHING here is written to GoHighLevel. Since the tag rebuild the app
  // applies a tag and Jake's workflow moves the card; this table only says
  // where each outcome is EXPECTED to end up, so the console can report a board
  // that has drifted from the buttons.

  it("expects a close in Closed, not in New Client", () => {
    // New Client comes after onboarding is booked. A close that jumped straight
    // there would skip two stages of Jake's own process.
    expect(routeFor("closed").stage).toBe(SALES_STAGES.closed);
    expect(Object.values(SALES_STAGES)).not.toContain("New Client");
  });

  it("expects a follow-up in Follow Up, and names no retired stage", () => {
    // Every one of these was on the board at some point in July and is not now.
    // Expecting a stage that no longer exists is how a button silently stops.
    expect(routeFor("follow_up").stage).toBe(SALES_STAGES.followUp);
    for (const retired of ["Appointment Showed", "Appointment Booked", "No-Close"]) {
      expect(Object.values(SALES_STAGES)).not.toContain(retired);
    }
  });

  it("sends both nos to the one column, told apart by their LABEL", () => {
    // The board has a single "Not Interested/Unqualified" column, so the stage
    // cannot distinguish them; the tag does. Their labels therefore have to
    // differ, or the two buttons would be indistinguishable on screen.
    expect(routeFor("not_interested").stage).toBe(SALES_STAGES.notInterested);
    expect(routeFor("not_qualified").stage).toBe(SALES_STAGES.notInterested);
    expect(routeFor("not_interested").label).not.toBe(routeFor("not_qualified").label);
  });

  it("expects a no-show in No-Show", () => {
    expect(routeFor("no_show").stage).toBe(SALES_STAGES.noShow);
  });

  it("falls back to the booking stage when nothing has been decided", () => {
    expect(routeFor(null)).toEqual(BOOKING_ROUTE);
    expect(routeFor(undefined)).toEqual(BOOKING_ROUTE);
    expect(BOOKING_ROUTE.stage).toBe(SALES_STAGES.booked);
  });

  it("asserts no won/lost status anywhere", () => {
    // The app used to set won/lost alongside the stage. It sets neither now:
    // status is the workflow's to decide, and two systems deciding it is how a
    // report and a board start disagreeing.
    expect(BOOKING_ROUTE).not.toHaveProperty("status");
    for (const outcome of ["closed", "follow_up", "not_interested", "not_qualified", "no_show"] as const) {
      expect(routeFor(outcome)).not.toHaveProperty("status");
    }
  });
});

describe("normalizeStageName", () => {
  it("ignores case, spacing, punctuation and emoji", () => {
    expect(normalizeStageName("No-Show")).toBe("noshow");
    expect(normalizeStageName("no show")).toBe("noshow");
    expect(normalizeStageName("No Show ❌")).toBe("noshow");
  });

  it("reduces a name with nothing matchable in it to empty", () => {
    expect(normalizeStageName("❌")).toBe("");
    expect(normalizeStageName("   ")).toBe("");
  });
});

describe("findStage", () => {
  it("finds an exact stage whatever the punctuation", () => {
    expect(findStage(LIVE_STAGES, "No-Show")?.id).toBe("c3da");
    expect(findStage(LIVE_STAGES, "no show")?.id).toBe("c3da");
  });

  it("finds a stage the board has given a longer name", () => {
    expect(findStage(LIVE_STAGES, "Not Interested")?.id).toBe("b753");
  });

  it("prefers an exact match over a longer one starting the same way", () => {
    const stages = [
      { id: "long", name: "New Client Onboarding" },
      { id: "exact", name: "New Client" },
    ];
    expect(findStage(stages, "New Client")?.id).toBe("exact");
  });

  it("refuses to guess when two stages both start with the wanted name", () => {
    const stages = [
      { id: "a", name: "New Client" },
      { id: "b", name: "New Client (Referral)" },
    ];
    // Ambiguous. Dropping the card into either is worse than not moving it.
    expect(findStage(stages, "New Clien")).toBeNull();
  });

  it("does not let a short live name swallow a longer wanted one", () => {
    // The prefix only runs one way: wanted is the START of live, never the
    // reverse, or a column called "New" would answer for "New Client".
    expect(findStage([{ id: "n", name: "New" }], "New Client")).toBeNull();
  });

  it("returns null for a stage that is not on the board", () => {
    // "Appointment Showed" was on this board in July and is not any more.
    expect(findStage(LIVE_STAGES, "Appointment Showed")).toBeNull();
  });

  it("returns null for an empty board and an empty name", () => {
    expect(findStage([], "New Client")).toBeNull();
    expect(findStage(LIVE_STAGES, "")).toBeNull();
  });
});

describe("requiredStages / missingStages", () => {
  it("lists each expected stage once, with the shared no-column not repeated", () => {
    const required = requiredStages();
    expect(required).toEqual([...new Set(required)]);
    expect(required).toContain(SALES_STAGES.booked);
    expect(required).toContain(SALES_STAGES.followUp);
    expect(required).toContain(SALES_STAGES.notInterested);
    expect(required).toContain(SALES_STAGES.noShow);
    expect(required).toContain(SALES_STAGES.closed);
    // Two outcomes point at it; it is named once.
    expect(required.filter((r) => r === SALES_STAGES.notInterested)).toHaveLength(1);
  });

  it("finds nothing missing on the live board as Jake rebuilt it", () => {
    expect(missingStages(LIVE_STAGES)).toEqual([]);
  });

  it("names a stage the board has lost", () => {
    const before = LIVE_STAGES.filter((s) => s.name !== "Follow Up");
    expect(missingStages(before)).toEqual(["Follow Up"]);
  });
});

describe("pickSalesPipeline", () => {
  // The four boards on the live agency account, 2026-07-29. The Sales board was
  // called "Sales Pipeline" when this file was written and is called "Sales"
  // now, which is the whole reason the short name is accepted.
  const LIVE_BOARDS = [
    { id: "Lwzn", name: "Cold Calling" },
    { id: "Hr5i", name: "Cold SMS" },
    { id: "qjwU", name: "Main" },
    { id: "Faxu", name: "Sales" },
  ];

  it("finds the board on the live account, which is called Sales", () => {
    expect(pickSalesPipeline(LIVE_BOARDS)?.id).toBe("Faxu");
  });

  it("still finds it under its old, longer name", () => {
    expect(pickSalesPipeline([...LIVE_BOARDS, { id: "old", name: "Sales Pipeline" }])?.id).toBe(
      "old",
    );
  });

  it("prefers the long name when both are on the account", () => {
    // Two boards both plausibly the one. The name this app was written against
    // wins, rather than whichever GoHighLevel happened to return first.
    const both = [
      { id: "short", name: "Sales" },
      { id: "long", name: "Sales Pipeline" },
    ];
    expect(pickSalesPipeline(both)?.id).toBe("long");
    expect(pickSalesPipeline(both.slice().reverse())?.id).toBe("long");
  });

  it("finds a long name the account has added a qualifier to", () => {
    expect(pickSalesPipeline([{ id: "q", name: "Sales Pipeline (2026)" }])?.id).toBe("q");
  });

  it("does not let a board that merely starts with Sales answer for it", () => {
    // The short name is exact-only on purpose: picking the wrong board is how
    // cards land somewhere nobody is looking.
    expect(pickSalesPipeline([{ id: "c", name: "Sales Calls" }])).toBeNull();
    expect(pickSalesPipeline([{ id: "t", name: "Sales Team" }])).toBeNull();
  });

  it("ignores case and punctuation, like every other name match here", () => {
    expect(pickSalesPipeline([{ id: "s", name: "SALES 💰" }])?.id).toBe("s");
  });

  it("returns null when no board on the account is the Sales board", () => {
    expect(pickSalesPipeline(LIVE_BOARDS.slice(0, 3))).toBeNull();
    expect(pickSalesPipeline([])).toBeNull();
  });

  it("refuses to guess between two qualified long names", () => {
    const two = [
      { id: "a", name: "Sales Pipeline 2025" },
      { id: "b", name: "Sales Pipeline 2026" },
    ];
    expect(pickSalesPipeline(two)).toBeNull();
  });
});

describe("deals going stale", () => {
  const now = Date.parse("2026-07-29T12:00:00.000Z");
  const card = (over: Record<string, unknown> = {}) => ({
    status: "open",
    updatedAt: "2026-07-29T09:00:00.000Z",
    ...over,
  });

  it("counts the days a card has sat still", () => {
    expect(daysStill("2026-07-15T12:00:00.000Z", now)).toBe(14);
    expect(daysStill("2026-07-29T09:00:00.000Z", now)).toBe(0);
  });

  it("reports no age at all for a card the CRM gave no date", () => {
    // Unknown age is not the same fact as fresh, and drawing it as either would
    // be inventing one.
    expect(daysStill(null, now)).toBeNull();
    expect(daysStill("", now)).toBeNull();
    expect(daysStill("last Tuesday", now)).toBeNull();
  });

  it("never reads a card as younger than today when the CRM clock runs ahead", () => {
    expect(daysStill("2026-07-30T12:00:00.000Z", now)).toBe(0);
  });

  it("flags an open card that has not moved in a fortnight", () => {
    expect(isStale(card({ updatedAt: "2026-07-15T12:00:00.000Z" }), now)).toBe(true);
    expect(isStale(card({ updatedAt: "2026-07-16T12:00:00.000Z" }), now)).toBe(false);
    expect(STALE_AFTER_DAYS).toBe(14);
  });

  // A sale is not a neglected deal. Flagging the won column would turn every
  // close into a complaint that never goes away.
  it("leaves won and lost deals alone however long they sit", () => {
    const old = { updatedAt: "2026-01-01T12:00:00.000Z" };
    expect(isStale(card({ ...old, status: "won" }), now)).toBe(false);
    expect(isStale(card({ ...old, status: "lost" }), now)).toBe(false);
    expect(isStale(card({ ...old, status: "open" }), now)).toBe(true);
  });

  it("does not flag a card whose age is unknown", () => {
    expect(isStale(card({ updatedAt: null }), now)).toBe(false);
  });
});
