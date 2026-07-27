import { describe, it, expect } from "vitest";
import {
  SALES_CALL_OUTCOMES,
  groupFor,
  isSalesCallOutcome,
  totalsFor,
  type CountableCall,
  type SalesCallOutcome,
} from "./salesCalls";

function call(over: Partial<CountableCall> = {}): CountableCall {
  return { scheduledAt: "2026-07-20T15:00:00.000Z", outcome: null, cashCollected: null, ...over };
}

describe("the outcome vocabulary", () => {
  it("matches the CHECK constraint in migration 0057", () => {
    expect(Object.keys(SALES_CALL_OUTCOMES).sort()).toEqual([
      "closed",
      "follow_up",
      "no_show",
      "not_a_fit",
    ]);
  });

  // The distinction the whole table exists for.
  it("counts every outcome but a no-show as having turned up", () => {
    expect(SALES_CALL_OUTCOMES.closed.showed).toBe(true);
    expect(SALES_CALL_OUTCOMES.follow_up.showed).toBe(true);
    expect(SALES_CALL_OUTCOMES.not_a_fit.showed).toBe(true);
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

  it("counts the four outcomes apart", () => {
    const t = totalsFor([
      call({ outcome: "closed" }),
      call({ outcome: "follow_up" }),
      call({ outcome: "not_a_fit" }),
      call({ outcome: "no_show" }),
    ]);
    expect(t.closed).toBe(1);
    expect(t.followUp).toBe(1);
    expect(t.notAFit).toBe(1);
    expect(t.noShowed).toBe(1);
    expect(t.showed).toBe(3);
    expect(t.decided).toBe(4);
  });

  it("reads the show rate off the decided meetings and the close rate off the shows", () => {
    const t = totalsFor([
      call({ outcome: "closed" }),
      call({ outcome: "not_a_fit" }),
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
