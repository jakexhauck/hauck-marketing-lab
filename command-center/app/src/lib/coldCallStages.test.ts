import { describe, expect, it } from "vitest";
import { COLD_CALL_STAGES, stageAfterNoAnswer } from "./coldCallStages";

// The agency's live "Cold Calling" pipeline in GoHighLevel, read from the API on
// 1 August 2026 and pasted here verbatim.
//
// This is the contract the sync depends on. planLeadSync accepts a GoHighLevel
// card only when its stage name is in the app's stored vocabulary, matched as an
// exact string, so a stage renamed on either side stops importing SILENTLY: the
// card is filed under skippedStages and nobody is told the queue is short.
//
// That is not hypothetical. The app stored "1st Dial (Day 1)" and "2nd Dial (Day
// 2)" while the board said "No Answer Day 1" and "No Answer Day 2", so every
// chased prospect was skipped from the day the board was renamed until 0076.
//
// If this test fails, the board changed. Re-read it with
//   GET /opportunities/pipelines?locationId=<agency>
// and update BOTH this list and the CHECK constraint in a migration. Do not
// simply edit the expectation.
const LIVE_BOARD = [
  "New Lead",
  "No Answer Day 1",
  "No Answer Day 2",
  "Call Back",
  "Not Interested",
] as const;

describe("COLD_CALL_STAGES against the live board", () => {
  it("can store every stage the live pipeline has", () => {
    const stored = COLD_CALL_STAGES.map((s) => s.label);
    for (const stage of LIVE_BOARD) expect(stored).toContain(stage);
  });

  it("orders its stages the way the board does", () => {
    // Not just membership: the pages are drawn in this order, and a queue that
    // reads Call Back before No Answer Day 1 misrepresents the day's work.
    const stored = COLD_CALL_STAGES.map((s) => s.label).filter((l) =>
      (LIVE_BOARD as readonly string[]).includes(l),
    );
    expect(stored).toEqual([...LIVE_BOARD]);
  });

  it("has exactly one status that is not on that board, and it is Booked", () => {
    // Booked is app-side only: a booked demo moves to the SALES pipeline at
    // "Demo Call Booked". Any OTHER extra status is a stage the sync will never
    // match, which is the bug this file exists to catch.
    const extra = COLD_CALL_STAGES.map((s) => s.label).filter(
      (l) => !(LIVE_BOARD as readonly string[]).includes(l),
    );
    expect(extra).toEqual(["Booked"]);
  });

  it("tags Not Interested, which is what moves the card over there", () => {
    const ni = COLD_CALL_STAGES.find((s) => s.id === "not-interested");
    expect(ni?.tag).toBe("cc not interested");
  });

  it("sends a no-answer to the stage matching the attempt count", () => {
    expect(stageAfterNoAnswer(1)).toBe("No Answer Day 1");
    expect(stageAfterNoAnswer(2)).toBe("No Answer Day 2");
    expect(stageAfterNoAnswer(9)).toBe("No Answer Day 2");
  });
});
