import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getColdCallData,
  getSalesCalls,
  getSalesPipeline,
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

// Sales > Sales Pipeline: the board those outcomes land on.
//
// Short staleTime and a refetch on focus, matching useAgencyPipelinesQuery: the
// cards are moved by Jake's own hands in GoHighLevel as often as by this app,
// so a board left sitting is a board that is wrong.
const PIPELINE_KEY = ["admin", "sales", "pipeline"];

export function useSalesPipelineQuery() {
  return useQuery({
    queryKey: PIPELINE_KEY,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    // And a timer on top of the focus refetch, so a board left on screen while
    // Jake works the deals in GoHighLevel catches up on its own.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    queryFn: () => getSalesPipeline(),
  });
}

// Sales > Cold Call Data. Keyed by month so stepping back through the nav
// caches each one rather than refetching. Nothing here reads GoHighLevel: the
// dials are ours, already in our own database, so this is cheap and can be
// stale for longer than the calendar-reading queries beside it.
export function useColdCallDataQuery(month: string) {
  return useQuery({
    queryKey: ["admin", "tracker", "cold-call-data", month],
    enabled: !!month,
    staleTime: 60_000,
    queryFn: () => getColdCallData(month),
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
      qc.invalidateQueries({ queryKey: PIPELINE_KEY });
    },
  });
}
