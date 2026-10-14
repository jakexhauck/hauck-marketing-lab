// Pure roll-ups for the Setter Suite scoreboard. Same contract as
// setterMetrics.ts: plain functions of setter_dials rows, no I/O, so the
// scoreboard endpoint stays a thin query wrapper and the math is testable
// without a database.
//
// Definitions match the sales process (dial -> speak -> book a phone appt):
//   dials    - every dial logged in the window
//   reached  - unique contacts somebody actually spoke to
//   booked   - unique contacts whose dial outcome was "booked"
//   bookRate - booked / reached; null (not zero) when nobody was reached,
//              because 0% would read as "reaching people and booking none",
//              which is a different failure than not reaching anyone.

export type ScoreDialRow = {
  contact_id: string;
  dialed_at: string;
  spoke: boolean;
  outcome: string;
};

export interface ScoreboardMetrics {
  dials: number;
  reached: number;
  booked: number;
  bookRate: number | null;
}

export function computeScoreboard(rows: ScoreDialRow[]): ScoreboardMetrics {
  const reached = new Set<string>();
  const booked = new Set<string>();
  for (const r of rows) {
    if (r.spoke) reached.add(r.contact_id);
    if (r.outcome === "booked") booked.add(r.contact_id);
  }
  return {
    dials: rows.length,
    reached: reached.size,
    booked: booked.size,
    bookRate: reached.size > 0 ? booked.size / reached.size : null,
  };
}

// Rows at or after the boundary. Compared as parsed epochs, not strings, for
// the same offset-representation reason documented in setterMetrics.ts:
// "2026-07-20T23:00:00-04:00" sorts as a lesser STRING than an earlier UTC
// instant. An unparseable dialed_at is excluded: it cannot be placed in time,
// and counting it in "today" would overstate the day.
export function rowsSince(rows: ScoreDialRow[], sinceMs: number): ScoreDialRow[] {
  return rows.filter((r) => {
    const t = Date.parse(r.dialed_at);
    return !Number.isNaN(t) && t >= sinceMs;
  });
}
