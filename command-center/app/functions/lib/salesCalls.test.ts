import { describe, it, expect } from "vitest";
import {
  SALES_CALL_OUTCOMES,
  SALES_NO_REASONS,
  bySource,
  contractValue,
  daysLate,
  groupFor,
  isDueBack,
  isSalesCallOutcome,
  isSalesNoReason,
  parseDeal,
  reasonCounts,
  sourceLabel,
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

  // The whole reason the deal column exists. Cash on the call is what somebody
  // paid today; the retainer is what the month is actually worth.
  it("adds up the monthly retainers apart from the cash", () => {
    const t = totalsFor([
      call({ outcome: "closed", cashCollected: 500, deal: { monthly: 2000, months: 12 } }),
      call({ outcome: "closed", cashCollected: 0, deal: { monthly: 1500, months: null } }),
      call({ outcome: "no_show" }),
    ]);
    expect(t.cash).toBe(500);
    expect(t.newMrr).toBe(3500);
  });

  it("counts a retainer only where a deal actually closed", () => {
    // A monthly figure on anything but a close is a mistake upstream. Totalling
    // it would report revenue from a meeting that did not sell.
    const t = totalsFor([
      call({ outcome: "not_interested", deal: { monthly: 4000, months: 6 } }),
      call({ outcome: "closed", deal: { monthly: 1000, months: null } }),
    ]);
    expect(t.newMrr).toBe(1000);
  });
});

describe("the deal on a close", () => {
  it("reads a monthly and a term off the stored shape", () => {
    expect(parseDeal({ monthly: 2000, months: 12 })).toEqual({ monthly: 2000, months: 12 });
  });

  it("takes a monthly with no term, because month-to-month is a real deal", () => {
    expect(parseDeal({ monthly: 2000 })).toEqual({ monthly: 2000, months: null });
  });

  it("is null for anything that is not a deal", () => {
    expect(parseDeal(null)).toBeNull();
    expect(parseDeal(undefined)).toBeNull();
    expect(parseDeal({})).toBeNull();
    expect(parseDeal({ monthly: 0 })).toBeNull();
    expect(parseDeal({ monthly: -50 })).toBeNull();
    expect(parseDeal({ monthly: "lots" })).toBeNull();
    expect(parseDeal("2000/mo")).toBeNull();
  });

  it("ignores a term that is not a positive whole number of months", () => {
    expect(parseDeal({ monthly: 500, months: 0 })).toEqual({ monthly: 500, months: null });
    expect(parseDeal({ monthly: 500, months: -3 })).toEqual({ monthly: 500, months: null });
    expect(parseDeal({ monthly: 500, months: 1.5 })).toEqual({ monthly: 500, months: null });
  });

  // Derived, never stored: two copies of one product is how they disagree.
  it("multiplies out to a contract value only when the term is known", () => {
    expect(contractValue({ monthly: 2000, months: 12 })).toBe(24000);
    expect(contractValue({ monthly: 2000, months: null })).toBeNull();
    expect(contractValue(null)).toBeNull();
  });
});

describe("why they said no", () => {
  it("accepts only a reason from the list", () => {
    expect(isSalesNoReason("price")).toBe(true);
    expect(isSalesNoReason("too expensive")).toBe(false);
    expect(isSalesNoReason("")).toBe(false);
    expect(isSalesNoReason(null)).toBe(false);
  });

  it("counts the reasons across a month, ignoring rows that gave none", () => {
    const counts = reasonCounts([
      call({ outcome: "not_interested", reason: "price" }),
      call({ outcome: "not_interested", reason: "price" }),
      call({ outcome: "not_qualified", reason: "wrong_fit" }),
      // A reason on a close should never happen, and if it does it is not a no.
      call({ outcome: "closed", reason: "price" }),
      call({ outcome: "not_interested", reason: null }),
      // Anything not on the list is dropped rather than becoming its own row.
      call({ outcome: "not_interested", reason: "vibes" }),
    ]);
    expect(counts).toEqual({ price: 2, wrong_fit: 1 });
  });

  it("has a label for every reason", () => {
    for (const key of Object.keys(SALES_NO_REASONS)) {
      expect(SALES_NO_REASONS[key as keyof typeof SALES_NO_REASONS].label.length).toBeGreaterThan(0);
    }
  });
});

describe("by source", () => {
  it("calls an empty source a cold call and names the calendar plainly", () => {
    // Mirrors what the row has always shown, in one place, so the table and the
    // provenance line cannot start disagreeing about what a blank source means.
    expect(sourceLabel("")).toBe("Cold call");
    expect(sourceLabel("Calendar")).toBe("Calendar");
    expect(sourceLabel("Referral")).toBe("Referral");
  });

  it("splits the funnel by where the meeting came from, busiest first", () => {
    const rows = bySource([
      call({ source: "", outcome: "closed", cashCollected: 500, deal: { monthly: 2000, months: 12 } }),
      call({ source: "", outcome: "no_show" }),
      call({ source: "", outcome: "not_interested" }),
      call({ source: "Calendar", outcome: "closed", cashCollected: 1000 }),
      call({ source: "Calendar", outcome: "closed" }),
    ]);

    expect(rows.map((r) => r.source)).toEqual(["Cold call", "Calendar"]);

    const cold = rows[0];
    expect(cold).toMatchObject({ booked: 3, showed: 2, closed: 1, cash: 500, mrr: 2000 });
    // Rates ride on the same rules as the page funnel: showed over decided,
    // closed over showed.
    expect(cold.showRate).toBeCloseTo(2 / 3);
    expect(cold.closeRate).toBe(0.5);

    const calendar = rows[1];
    expect(calendar).toMatchObject({ booked: 2, showed: 2, closed: 2, cash: 1000 });
    expect(calendar.closeRate).toBe(1);
  });

  it("reports no rate for a source nobody has recorded yet", () => {
    const [row] = bySource([call({ source: "Referral" })]);
    expect(row.booked).toBe(1);
    expect(row.showRate).toBeNull();
    expect(row.closeRate).toBeNull();
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
