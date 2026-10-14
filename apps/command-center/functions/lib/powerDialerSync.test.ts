import { describe, it, expect } from "vitest";
import { readWindowRows, DialReadError } from "./powerDialerSync";
import type { SupabaseClient } from "@supabase/supabase-js";

// readWindowRows is where the power dialer's cards come from: the pending rows
// it returns ARE the cards on screen, and the day tally is counted off the same
// table.
//
// It used to destructure `data` alone. supabase-js resolves a FAILED read with
// { data: null, error }, so a database hiccup came back as `dials: []` and the
// endpoint reported, with total confidence, that nobody was on the phone. Every
// card vanished off the dialer mid-shift and reappeared eight seconds later.
//
// An unreadable table has to be an error the caller can see. react-query keeps
// the last good answer when a refetch fails, so an error leaves the cards where
// they are; an empty list wipes them.

function stubDials(result: { data: unknown; error: unknown }) {
  const order = () => Promise.resolve(result);
  const gte = () => ({ order });
  const select = () => ({ gte });
  return { from: () => ({ select }) } as unknown as SupabaseClient;
}

// Dials read fine, the leads behind them do not.
function stubLeadsFail(dials: unknown[], leadResult: { data: unknown; error: unknown }) {
  return {
    from: (table: string) => {
      if (table === "cold_call_dials") {
        return { select: () => ({ gte: () => ({ order: () => Promise.resolve({ data: dials, error: null }) }) }) };
      }
      return { select: () => ({ in: () => Promise.resolve(leadResult) }) };
    },
  } as unknown as SupabaseClient;
}

const DIAL = {
  id: "dial-1",
  lead_id: "lead-1",
  outcome: "pending",
  dialed_at: "2026-08-21T15:00:00.000Z",
  call_message_id: "msg-1",
  call_status: "completed",
  duration_seconds: 90,
};

const SINCE = Date.parse("2026-08-21T14:00:00.000Z");

describe("readWindowRows", () => {
  it("returns the window's dials with no leads to join", async () => {
    const rows = await readWindowRows(stubDials({ data: [{ ...DIAL, lead_id: null }], error: null }), SINCE);
    expect(rows.dials).toHaveLength(1);
    expect(rows.leads).toEqual([]);
  });

  it("reads an empty window as genuinely empty", async () => {
    const rows = await readWindowRows(stubDials({ data: [], error: null }), SINCE);
    expect(rows.dials).toEqual([]);
  });

  // REGRESSION. This is what emptied the dialer's cards.
  it("throws rather than reporting an empty window when the dials read failed", async () => {
    const client = stubDials({ data: null, error: { message: "canceling statement due to statement timeout" } });
    await expect(readWindowRows(client, SINCE)).rejects.toBeInstanceOf(DialReadError);
  });

  it("throws when the dials read but their leads do not", async () => {
    const client = stubLeadsFail([DIAL], { data: null, error: { message: "fetch failed" } });
    await expect(readWindowRows(client, SINCE)).rejects.toBeInstanceOf(DialReadError);
  });
});
