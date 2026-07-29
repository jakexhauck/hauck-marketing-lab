import { describe, it, expect } from "vitest";
import {
  SALES_CALL_OUTCOMES,
  daysLate,
  groupFor,
  isDueBack,
  isSalesCallOutcome,
  totalsFor,
  type CountableCall,
  type SalesCallOutcome,
} from "./salesCalls";

function call(over: Partial<CountableCall> = {}): CountableCall {
  return { scheduledAt: "2026-07-20T15:00:00.000Z", outcome: null, cashCollected: null, ...over };
}

describe("the outcome vocabulary", () => {
  it("matches the CHECK constraint in migration 0067", () => {
    // The constraint is the database's copy of this list. Adding an outcome
    // here without the migration means every press of the new button fails on
    // write, which is the failure this test exists to catch before it ships.
    expect(Object.keys(SALES_CALL_OUTCOMES).sort()).toEqual([
      "closed",
      "follow_up",
      "no_show",
      "not_interested",
      "not_qualified",
    ]);
  });

  // The distinction the whole table exists for.
  it("counts every outcome but a no-show as having turned up", () => {
    expect(SALES_CALL_OUTCOMES.closed.showed).toBe(true);
    expect(SALES_CALL_OUTCOMES.follow_up.showed).toBe(true);
    expect(SALES_CALL_OUTCOMES.not_qualified.showed).toBe(true);
    expect(SALES_CALL_OUTCOMES.not_interested.showed).toBe(true);
    expect(SALES_CALL_OUTCOMES.no_show.showed).toBe(false);
  });

  it("only a close is a win", () => {
    const won = (Object.keys(SALES_CALL_OUTCOMES) as SalesCallOutcome[]).filter(
      (o) => SALES_CALL_OUTCOMES[o].won,
    );
    expect(won).toEqual(["closed"]);
  });

  it("rejects anything the table would not accept", () => {
    expect(isSalesCallOutcome("closed")).toBe(true);
    expect(isSalesCallOutcome("showed")).toBe(false);
    expect(isSalesCallOutcome("")).toBe(false);
    expect(isSalesCallOutcome(null)).toBe(false);
    expect(isSalesCallOutcome(3)).toBe(false);
  });
});

describe("totalsFor", () => {
  it("has no rates to report from an empty month", () => {
    const t = totalsFor([]);
    expect(t.booked).toBe(0);
    expect(t.showRate).toBeNull();
    expect(t.closeRate).toBeNull();
  });

  // The mistake this guards: a meeting nobody has recorded yet is not a
  // no-show, and counting it as one would make the show rate fall every time
  // somebody books ahead.
  it("does not let a meeting still to happen drag the show rate down", () => {
    const t = totalsFor([call({ outcome: "closed" }), call(), call()]);
    expect(t.booked).toBe(3);
    expect(t.decided).toBe(1);
    expect(t.pending).toBe(2);
    expect(t.showRate).toBe(1);
  });

  it("counts the five outcomes apart", () => {
    const t = totalsFor([
      call({ outcome: "closed" }),
      call({ outcome: "follow_up" }),
      call({ outcome: "not_interested" }),
      call({ outcome: "not_qualified" }),
      call({ outcome: "no_show" }),
    ]);
    expect(t.closed).toBe(1);
    expect(t.followUp).toBe(1);
    // The two flavours of no, counted apart: one heard the pitch, the other was
    // never a prospect.
    expect(t.notInterested).toBe(1);
    expect(t.notQualified).toBe(1);
    expect(t.noShowed).toBe(1);
    expect(t.showed).toBe(4);
    expect(t.decided).toBe(5);
  });

  it("reads the show rate off the decided meetings and the close rate off the shows", () => {
    const t = totalsFor([
      call({ outcome: "closed" }),
      call({ outcome: "not_qualified" }),
      call({ outcome: "no_show" }),
      call({ outcome: "no_show" }),
    ]);
    expect(t.showRate).toBe(0.5); // 2 of 4 turned up
    expect(t.closeRate).toBe(0.5); // 1 of the 2 who did
  });

  it("has no close rate when nobody has turned up yet", () => {
    const t = totalsFor([call({ outcome: "no_show" })]);
    expect(t.showRate).toBe(0);
    expect(t.closeRate).toBeNull();
  });

  it("adds up the cash", () => {
    const t = totalsFor([
      call({ outcome: "closed", cashCollected: 1500 }),
      call({ outcome: "closed", cashCollected: 500 }),
      call({ outcome: "no_show" }),
    ]);
    expect(t.cash).toBe(2000);
  });
});

describe("groupFor", () => {
  const now = Date.parse("2026-07-20T12:00:00.000Z");

  it("files a meeting still to come as upcoming", () => {
    expect(groupFor(call({ scheduledAt: "2026-07-20T15:00:00.000Z" }), now)).toBe("upcoming");
  });

  it("asks for an answer once the slot has passed", () => {
    expect(groupFor(call({ scheduledAt: "2026-07-20T09:00:00.000Z" }), now)).toBe("awaiting");
  });

  it("files anything already answered as recorded, whenever it was", () => {
    expect(
      groupFor(call({ scheduledAt: "2026-08-01T09:00:00.000Z", outcome: "closed" }), now),
    ).toBe("recorded");
  });

  // A meeting with no time on it would otherwise sit in "upcoming" forever and
  // never be asked about.
  it("asks about a meeting with no time on it rather than hiding it", () => {
    expect(groupFor(call({ scheduledAt: null }), now)).toBe("awaiting");
    expect(groupFor(call({ scheduledAt: "not a date" }), now)).toBe("awaiting");
  });
});

describe("due-back follow-ups", () => {
  const now = Date.parse("2026-07-29T12:00:00.000Z");

  it("pulls a follow-up whose day has arrived out of the records and into the work", () => {
    // The promise this whole group exists for. Before it, a follow-up sat under
    // "recorded" and the date shown on its row was the only trace of it.
    const due = call({ outcome: "follow_up", followUpAt: "2026-07-27T09:00:00.000Z" });
    expect(groupFor(due, now)).toBe("due_back");
  });

  it("leaves a follow-up still in the future filed as recorded", () => {
    const later = call({ outcome: "follow_up", followUpAt: "2026-08-10T09:00:00.000Z" });
    expect(groupFor(later, now)).toBe("recorded");
  });

  it("never makes a job of a follow-up with no date on it", () => {
    // Nothing was agreed, so nothing is owed. Inventing a due date would put a
    // call on somebody's list that nobody promised.
    expect(groupFor(call({ outcome: "follow_up" }), now)).toBe("recorded");
    expect(groupFor(call({ outcome: "follow_up", followUpAt: "nonsense" }), now)).toBe("recorded");
  });

  it("leaves every other outcome exactly where it was", () => {
    for (const outcome of ["closed", "not_interested", "not_qualified", "no_show"] as const) {
      expect(groupFor(call({ outcome, followUpAt: "2026-07-01T09:00:00.000Z" }), now)).toBe(
        "recorded",
      );
    }
  });

  it("counts how late in whole days, so the list can lead with the worst", () => {
    expect(daysLate("2026-07-26T12:00:00.000Z", now)).toBe(3);
    expect(daysLate("2026-07-29T09:00:00.000Z", now)).toBe(0);
    expect(daysLate("2026-08-02T12:00:00.000Z", now)).toBeLessThan(0);
    expect(daysLate(null, now)).toBeNull();
  });

  it("does not call a follow-up due before its day has actually come", () => {
    expect(isDueBack("2026-07-29T18:00:00.000Z", now)).toBe(false);
    expect(isDueBack("2026-07-29T09:00:00.000Z", now)).toBe(true);
  });
});
