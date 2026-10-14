import { COLD_SMS_BOARD_KEY } from "./useColdSmsBoard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSalesCalls,
  recordSalesCallOutcome,
  type SalesMeeting,
} from "../lib/api";

// Sales > Sales Calls (0060).
//
// Separate from useColdCall's meeting hooks on purpose. That query is a
// caller's own bookings and is cheap; this one reads the agency calendars on
// the way through, so it must not share a cache key with a list that does not.

const KEY = ["admin", "sales", "calls"];

export function useSalesCallsQuery() {
  return useQuery({
    queryKey: KEY,
    // Longer than the cold-call lists because each fetch reads a live calendar.
    // A minute is short enough that a meeting booked mid-morning shows up
    // without a reload, and long enough that clicking between tabs does not
    // re-read GoHighLevel every time.
    staleTime: 60_000,
    // The page has no read button any more, so the timer is what keeps it
    // honest: an open tab reconciles the calendars every two minutes, and the
    // focus refetch catches anything booked while it was in the background.
    // Not in the background, since a tab nobody is looking at reading the CRM
    // all day buys nothing.
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    queryFn: () => getSalesCalls(true),
  });
}

export interface RecordSalesCallInput {
  id: string;
  outcome: NonNullable<SalesMeeting["outcome"]>;
  // Required by both kinds of no. A key from SALES_NO_REASONS, never free text.
  reason?: string;
  followUpAt?: string;
  // Money on the call, and separately the retainer that was sold. Both only
  // mean anything on a close.
  cashCollected?: number | null;
  monthly?: number | null;
  months?: number | null;
  // Notes on the meeting, allowed on every outcome.
  notes?: string;
}

// Say what happened at one meeting, and move its card.
//
// Retried never, for the same reason a dial is not: this is the number a
// commission is argued over, and a resent PATCH that actually succeeded is a
// second answer overwriting the first.
export function useRecordSalesCallOutcome() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (input: RecordSalesCallInput) => recordSalesCallOutcome(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      // Cold Call > Booked is the same table seen from the caller's end, so it
      // is stale the moment an outcome is recorded here.
      qc.invalidateQueries({ queryKey: ["admin", "cold-call", "meetings"] });
      // The outcome just moved a card, so the board is a column out of date.
      qc.invalidateQueries({ queryKey: [...COLD_SMS_BOARD_KEY, "sales"] });
    },
  });
}
