import { describe, expect, it } from "vitest";
import {
  BOOKING_ROUTE,
  findStage,
  missingStages,
  normalizeStageName,
  requiredStages,
  routeFor,
  SALES_STAGES,
} from "./salesPipeline";

// The live Sales Pipeline as it actually read on 2026-07-27. Note the tail on
// "Not Interested/Unqualified": the plan written the day before called it
// "Not Interested", which is the whole reason findStage tolerates a suffix.
const LIVE_STAGES = [
  { id: "e1ab", name: "New Lead" },
  { id: "b753", name: "Not Interested/Unqualified" },
  { id: "1540", name: "Appointment Booked" },
  { id: "3991", name: "Appointment Showed" },
  { id: "c3da", name: "No-Show" },
  { id: "2397", name: "New Client" },
];

describe("routeFor", () => {
  it("sends a close to New Client and marks it won", () => {
    expect(routeFor("closed")).toMatchObject({
      stage: SALES_STAGES.newClient,
      status: "won",
    });
  });

  it("sends a not-a-fit to Not Interested and marks it lost", () => {
    expect(routeFor("not_a_fit")).toMatchObject({
      stage: SALES_STAGES.notInterested,
      status: "lost",
    });
  });

  it("leaves a no-show OPEN, because they can be re-booked", () => {
    expect(routeFor("no_show")).toMatchObject({
      stage: SALES_STAGES.noShow,
      status: "open",
    });
  });

  it("puts a follow-up on Appointment Showed, still open", () => {
    // They turned up. That is the fact the board should carry, and the deal is
    // not decided either way.
    expect(routeFor("follow_up")).toMatchObject({
      stage: SALES_STAGES.showed,
      status: "open",
    });
  });

  it("falls back to the booking stage when nothing has been decided", () => {
    expect(routeFor(null)).toEqual(BOOKING_ROUTE);
    expect(routeFor(undefined)).toEqual(BOOKING_ROUTE);
    expect(BOOKING_ROUTE.stage).toBe(SALES_STAGES.booked);
  });

  it("never marks a showed-but-undecided meeting won", () => {
    // A show rate turning into a close rate is the exact failure 0057 was
    // shaped to prevent; it must not come back in through the pipeline.
    expect(routeFor("follow_up").status).not.toBe("won");
    expect(routeFor("no_show").status).not.toBe("won");
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
    expect(findStage(LIVE_STAGES, "Follow Up")).toBeNull();
  });

  it("returns null for an empty board and an empty name", () => {
    expect(findStage([], "New Client")).toBeNull();
    expect(findStage(LIVE_STAGES, "")).toBeNull();
  });
});

describe("requiredStages / missingStages", () => {
  it("lists the five stages the app is capable of writing, without repeats", () => {
    const required = requiredStages();
    expect(required).toEqual([...new Set(required)]);
    expect(required).toContain(SALES_STAGES.booked);
    expect(required).toContain(SALES_STAGES.showed);
    expect(required).toContain(SALES_STAGES.noShow);
    expect(required).toContain(SALES_STAGES.newClient);
    expect(required).toContain(SALES_STAGES.notInterested);
    // New Lead is on the board and the app never writes it.
    expect(required).not.toContain(SALES_STAGES.newLead);
  });

  it("finds nothing missing on the real board", () => {
    expect(missingStages(LIVE_STAGES)).toEqual([]);
  });

  it("names the stage a stripped-down board cannot carry", () => {
    const stripped = LIVE_STAGES.filter((s) => s.name !== "No-Show");
    expect(missingStages(stripped)).toEqual(["No-Show"]);
  });
});
