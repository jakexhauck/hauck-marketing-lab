import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSalesCalls, recordSalesCallOutcome, type SalesMeeting } from "../lib/api";

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
    queryFn: () => getSalesCalls(true),
  });
}

export interface RecordSalesCallInput {
  id: string;
  outcome: NonNullable<SalesMeeting["outcome"]>;
  notAFitReason?: string;
  followUpAt?: string;
  cashCollected?: number | null;
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
    },
  });
}
