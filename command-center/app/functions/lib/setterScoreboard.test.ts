import { describe, it, expect } from "vitest";
import { computeScoreboard, rowsSince, type ScoreDialRow } from "./setterScoreboard";

const T0 = Date.parse("2026-07-22T12:00:00Z");
const HOUR = 60 * 60 * 1000;

function row(over: Partial<ScoreDialRow>): ScoreDialRow {
  return {
    contact_id: "c1",
    dialed_at: new Date(T0).toISOString(),
    spoke: false,
    outcome: "no_answer",
    ...over,
  };
}

describe("computeScoreboard", () => {
  it("is all zeros with a null rate on no rows", () => {
    expect(computeScoreboard([])).toEqual({ dials: 0, reached: 0, booked: 0, bookRate: null });
  });

  it("counts every dial but unique contacts for reached and booked", () => {
    const rows = [
      row({ contact_id: "a", spoke: true }),
      row({ contact_id: "a", spoke: true, outcome: "booked" }),
      row({ contact_id: "b" }),
      row({ contact_id: "c", spoke: true, outcome: "not_interested" }),
    ];
    const m = computeScoreboard(rows);
    expect(m.dials).toBe(4);
    expect(m.reached).toBe(2); // a and c; b never spoke
    expect(m.booked).toBe(1); // a
    expect(m.bookRate).toBeCloseTo(1 / 2);
  });

  it("keeps the rate null (not zero) when dials happened but nobody was reached", () => {
    const m = computeScoreboard([row({}), row({ contact_id: "b" })]);
    expect(m.dials).toBe(2);
    expect(m.bookRate).toBeNull();
  });

  it("counts a booked outcome even without spoke, but it cannot inflate the rate denominator", () => {
    // Defensive: the dial write path forbids no_answer+spoke:true but booked
    // rows always carry spoke in practice; if one ever arrives without it,
    // booked still counts and reached does not.
    const m = computeScoreboard([row({ contact_id: "a", outcome: "booked" })]);
    expect(m.booked).toBe(1);
    expect(m.reached).toBe(0);
    expect(m.bookRate).toBeNull();
  });
});

describe("rowsSince", () => {
  it("keeps rows at or after the boundary and drops earlier ones", () => {
    const rows = [
      row({ contact_id: "old", dialed_at: new Date(T0 - 5 * HOUR).toISOString() }),
      row({ contact_id: "edge", dialed_at: new Date(T0).toISOString() }),
      row({ contact_id: "new", dialed_at: new Date(T0 + HOUR).toISOString() }),
    ];
    expect(rowsSince(rows, T0).map((r) => r.contact_id)).toEqual(["edge", "new"]);
  });

  it("compares instants, not strings, across offset representations", () => {
    // 23:00-04:00 is 03:00Z the NEXT day: later than the boundary even though
    // it is the lesser string.
    const rows = [row({ contact_id: "offset", dialed_at: "2026-07-21T23:00:00-04:00" })];
    expect(rowsSince(rows, Date.parse("2026-07-22T00:30:00Z"))).toHaveLength(1);
  });

  it("excludes rows whose timestamp cannot be parsed", () => {
    expect(rowsSince([row({ dialed_at: "garbage" })], T0)).toHaveLength(0);
  });
});
