import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  bookColdCall,
  bridgeColdCallDial,
  getAgencyPipelines,
  getColdCallCalendars,
  getColdCallSlots,
  getColdCallCallbackSlots,
  getColdCallCrm,
  getColdCallLive,
  getSalesMeetings,
  logColdCallDial,
  recordMeetingOutcome,
  reconcileColdCallTags,
  type ColdCallDialOutcome,
  type ColdCallRow,
  type SalesMeeting,
} from "../lib/api";
import { isColdCallNumericField, type ColdCallField } from "../lib/coldCall";

// Cold Call tracker data (Acquisition > Cold Call). Kept out of useApi.ts: this
// surface owns its own month-scoped cache and an optimistic per-cell save, and
// the shared hooks file is already large.

export interface ColdCallsResponse {
  days: ColdCallRow[];
  // Present only for the agency roll-up (callerId "all"): how many people are in
  // the sum, and how many of its days contain counts somebody typed rather than
  // dialled in the app. The page states both rather than passing a total off as
  // a pure measurement.
  agency?: { callers: number; typedDays: number };
}

// One cache entry per viewed month PER PERSON (0050). Two callers looking at the
// same month are two different sets of numbers, so the caller has to be in the
// key or one would serve the other's rows from cache.
function monthKey(month: string, callerId?: string) {
  return ["admin", "tracker", "cold-calls", month, callerId ?? "me"];
}

// `month` is "YYYY-MM". Rows come back sparse: only days that were logged.
// callerId is an owner-only lens: left out, the server returns the caller's own
// month, and a non-owner is pinned to their own whatever they send. "all" asks
// for every caller summed into one row per day.
export function useColdCallsQuery(month: string, callerId?: string) {
  return useQuery({
    queryKey: monthKey(month, callerId),
    staleTime: 30_000,
    queryFn: () =>
      api<ColdCallsResponse>(
        `/api/admin/tracker/cold-calls?month=${month}` +
          (callerId ? `&callerId=${encodeURIComponent(callerId)}` : ""),
      ),
  });
}

export interface SaveColdCallInput {
  day: string; // "YYYY-MM-DD"
  field: ColdCallField;
  value: string;
  // Whose day is being written. Owner-only; the server ignores it otherwise.
  callerId?: string;
}

// A blank cell clears the column; the server applies the same rule.
function optimisticValue(field: ColdCallField, value: string): number | string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (!isColdCallNumericField(field)) return raw;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
}

// Upsert one day's cell. Optimistic: the edited month is patched in place so the
// rates, footer and tiles settle instantly, rolled back if the write fails.
export function useSaveColdCallDay() {
  const qc = useQueryClient();
  return useMutation({
    // The PATCH answers with the typed row only; the recorded counts are not
    // touched by a typed cell, and the invalidate below refetches both anyway.
    mutationFn: (input: SaveColdCallInput) =>
      api<{ ok: boolean; day: Omit<ColdCallRow, "recorded"> }>("/api/admin/tracker/cold-calls", {
        method: "PATCH",
        body: JSON.stringify({
          day: input.day,
          field: input.field,
          value: input.value,
          callerId: input.callerId,
        }),
      }),
    onMutate: async (input) => {
      const month = input.day.slice(0, 7);
      const key = monthKey(month, input.callerId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ColdCallsResponse>(key);
      if (previous) {
        const patch = { [input.field]: optimisticValue(input.field, input.value) };
        const existing = previous.days.find((d) => d.day === input.day);
        const days = existing
          ? previous.days.map((d) => (d.day === input.day ? { ...d, ...patch } : d))
          : [
              ...previous.days,
              // A day with no row yet: stand one up so the edit shows at once.
              // The real id arrives with the invalidate on settle.
              {
                id: `pending:${input.day}`,
                day: input.day,
                callsMade: null,
                pickups: null,
                passThrough: null,
                meetingsBooked: null,
                objections: null,
                notes: null,
                recorded: null,
                ...patch,
              } as ColdCallRow,
            ].sort((a, b) => a.day.localeCompare(b.day));
        qc.setQueryData<ColdCallsResponse>(key, { days });
      }
      return { key, previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        qc.setQueryData(context.key, context.previous);
      }
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({
        queryKey: monthKey(input.day.slice(0, 7), input.callerId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// The agency's GoHighLevel boards (Cold Call > Pipelines).

// Read live, and kept fresh: these boards are moved by Jake's automations, not
// by this app, so a stale column is a card sitting somewhere it has already
// left. Short staleTime, and a refetch whenever the tab is looked at again.
export function useAgencyPipelinesQuery(pipelineId?: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "cold-call", "pipelines", pipelineId ?? "all"],
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: () => getAgencyPipelines(pipelineId),
  });
}

// ---------------------------------------------------------------------------
// Recording the attempt itself (0052).

export interface LogDialInput {
  leadId: string | null;
  outcome: ColdCallDialOutcome;
  // Why they said no. Sent with a no only, and it decides the outcome server
  // side, so spoke/pitched can never be asserted from here.
  reason?: string;
  note?: string;
  // Only for a callback: the agreed date, which becomes a GHL task.
  followUpDate?: string;
  // The agreed time on that date, "HH:MM" (0064). Absent means no time was
  // agreed, and the task falls back to 9am.
  followUpTime?: string;
  // Which dialing variation was on screen (0058). Checked server-side against
  // the live scripts, so this cannot credit a booking to whatever it likes.
  scriptId?: string | null;
  // When the Call button placed this call, ISO (0112). Only set for a call the
  // app dialled; absent for a caller working off their own handset.
  bridgedAt?: string | null;
  // The pending row a power-dialer call already wrote (0113). Sent, this press
  // completes that row rather than adding a second one for the same call.
  dialId?: string | null;
}

// Append one attempt. Fire-and-forget from the caller's point of view: the
// outcome buttons hand over the next prospect immediately rather than making
// someone wait on a write, and the month is invalidated when it lands so the
// tracker and the scoreboard catch up on their own.
//
// Not retried. A retry of a POST that actually succeeded would count the same
// call twice, and an over-counted dial is worse than a missing one: the whole
// point of this table is that its numbers cannot be inflated.
export function useLogColdCallDial() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (input: LogDialInput) => logColdCallDial(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "tracker", "cold-calls"] });
      // The same request pushed the prospect into GoHighLevel and stamped the
      // result onto the lead, so the list is now stale by one row.
      qc.invalidateQueries({ queryKey: ["admin", "tracker", "leads"] });
      // The dial was recorded against a script variation, and every variation's
      // numbers are recomputed from these rows on read (0058), so the script
      // test is now one dial out of date.
      qc.invalidateQueries({ queryKey: ["admin", "cold-call", "assets"] });
      // A judged call leaves the waiting list (0113). Without this the panel
      // keeps offering a call somebody has just dealt with until the next poll.
      qc.invalidateQueries({ queryKey: ["admin", "cold-call", "live"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Placing the call itself (0112).

// Press Call, GoHighLevel rings your phone and then bridges the prospect.
//
// Never retried, and for a harder reason than a dial is: a retry places a SECOND
// call to a real person who is at that moment already talking to the caller. A
// failed dial is a button pressed again by a human who can see what happened.
//
// Nothing is invalidated on success. Placing a call changes nothing anybody is
// looking at; the outcome press is what moves the prospect and refreshes the
// lists, exactly as before.
export function useBridgeDial() {
  return useMutation({
    retry: false,
    mutationFn: (leadId: string) => bridgeColdCallDial(leadId),
  });
}

// ---------------------------------------------------------------------------
// Making a GoHighLevel list mean a page of the book.

// Push the whole book over and set one tag per prospect.
//
// Never retried: it writes to live contact records, and a run that half
// finished is put right by pressing again, which is cheap because everything
// already correct is a no-op.
export function useReconcileColdCallTags() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (preview: boolean) => reconcileColdCallTags(preview),
    onSuccess: () => {
      // Prospects that had no contact record now have one, and the lead rows
      // carry the id and the cleared error.
      qc.invalidateQueries({ queryKey: ["admin", "tracker", "leads"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Following GoHighLevel's power dialer (0113).

// How often the calling page asks who was just rung.
//
// Eight seconds is picked against the job rather than against a network: a cold
// call is rarely under thirty, so this is several looks per call, and it is slow
// enough that a quiet afternoon costs one request every eight seconds and
// nothing else. The server answers most of those from the table alone.
const LIVE_POLL_MS = 8_000;

// Who the dialer just called. The request also RECORDS those calls, so this is
// the one query in the app that must keep running while a page sits open: stop
// polling and the calls still happen, they simply stop being counted.
//
// Refetches on focus and in the background, because a caller on the phone is by
// definition not looking at this tab.
export function useColdCallLive(enabled = true) {
  return useQuery({
    queryKey: ["admin", "cold-call", "live"],
    enabled,
    refetchInterval: LIVE_POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
    queryFn: getColdCallLive,
  });
}

// ---------------------------------------------------------------------------
// Booking on the agency's own calendar (Cold Call > the Booked outcome).

export function useColdCallCalendarsQuery(enabled = true) {
  return useQuery({
    queryKey: ["admin", "cold-call", "calendars"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => getColdCallCalendars(),
  });
}

// Free slots for one calendar. Short staleTime: a slot offered on the phone
// needs to still be there, and someone else may have taken it.
export function useColdCallSlotsQuery(calendarId: string, enabled = true) {
  return useQuery({
    queryKey: ["admin", "cold-call", "slots", calendarId],
    enabled: enabled && Boolean(calendarId),
    staleTime: 30_000,
    queryFn: () => getColdCallSlots(calendarId, 31),
  });
}

// Callbacks already promised, so the picker can grey out a time somebody else
// holds. Short staleTime for the same reason free slots have one: two callers on
// the phones at once is exactly the clash this prevents, so a list a minute out
// of date would let the collision straight through.
export function useColdCallCallbackSlots(enabled = true) {
  return useQuery({
    queryKey: ["admin", "cold-call", "callback-slots"],
    enabled,
    staleTime: 30_000,
    queryFn: getColdCallCallbackSlots,
  });
}

// Which GoHighLevel sub-account the book lives in, for the "Dial in
// GoHighLevel" link on the call card. Held for the session: this is an
// environment variable on the server, so it cannot change while somebody is on
// the phones, and a refetch per prospect would be a request that can only ever
// return the same string.
export function useColdCallCrm(enabled = true) {
  return useQuery({
    queryKey: ["admin", "cold-call", "crm"],
    enabled,
    staleTime: Infinity,
    queryFn: getColdCallCrm,
  });
}

// Books for real. Never retried: a resent POST double-books a live calendar.
export function useBookColdCall() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    // Typed off the client function rather than restated, so adding a field to
    // the booking body cannot leave this signature quietly behind.
    mutationFn: (input: Parameters<typeof bookColdCall>[0]) => bookColdCall(input),
    onSuccess: (_res, input) => {
      qc.invalidateQueries({ queryKey: ["admin", "tracker", "leads"] });
      qc.invalidateQueries({ queryKey: ["admin", "cold-call", "slots", input.calendarId] });
      // A booked prospect no longer holds its callback slot, so that time frees.
      qc.invalidateQueries({ queryKey: ["admin", "cold-call", "callback-slots"] });
      // The booking wrote the meeting's own row too, so Booked is stale.
      qc.invalidateQueries({ queryKey: ["admin", "cold-call", "meetings"] });
    },
  });
}

// ---------------------------------------------------------------------------
// What the meeting became (0057).

// Booked meetings and their outcomes. "" means everyone; a caller is scoped to
// themselves by the API whatever is passed.
export function useSalesMeetingsQuery(callerId = "") {
  return useQuery({
    queryKey: ["admin", "cold-call", "meetings", callerId || "all"],
    staleTime: 30_000,
    queryFn: () => getSalesMeetings(callerId || undefined),
  });
}

// Say what happened at one meeting. Retried never, for the same reason a dial is
// not: this is the number a commission is argued over, and a resent PATCH that
// actually succeeded is a second answer overwriting the first.
export function useRecordMeetingOutcome() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (input: RecordOutcomeInput) => recordMeetingOutcome(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "cold-call", "meetings"] });
    },
  });
}

// Identical to RecordSalesCallInput in useSalesCalls.ts, and it has to be: both
// pages record through the shared handler with the same panel
// (components/admin/sales/meetingUi.tsx), so a field missing here would be a
// fact the caller's page silently cannot record.
export interface RecordOutcomeInput {
  id: string;
  outcome: NonNullable<SalesMeeting["outcome"]>;
  // Required by both kinds of no. A key from SALES_NO_REASONS, never free text.
  reason?: string;
  followUpAt?: string;
  // Money on the call, and separately the retainer sold. Close only.
  cashCollected?: number | null;
  monthly?: number | null;
  months?: number | null;
  // Notes on the meeting, allowed on every outcome.
  notes?: string;
}
