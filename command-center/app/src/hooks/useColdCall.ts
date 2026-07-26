import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  bookColdCall,
  getColdCallCalendars,
  getColdCallSlots,
  type ColdCallRow,
} from "../lib/api";
import { isColdCallNumericField, type ColdCallField } from "../lib/coldCall";

// Cold Call tracker data (Acquisition > Cold Call). Kept out of useApi.ts: this
// surface owns its own month-scoped cache and an optimistic per-cell save, and
// the shared hooks file is already large.

export interface ColdCallsResponse {
  days: ColdCallRow[];
}

// One cache entry per viewed month PER PERSON (0050). Two callers looking at the
// same month are two different sets of numbers, so the caller has to be in the
// key or one would serve the other's rows from cache.
function monthKey(month: string, callerId?: string) {
  return ["admin", "tracker", "cold-calls", month, callerId ?? "me"];
}

// `month` is "YYYY-MM". Rows come back sparse: only days that were logged.
// callerId is an owner-only lens: left out, the server returns the caller's own
// month, and a non-owner is pinned to their own whatever they send.
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
    mutationFn: (input: SaveColdCallInput) =>
      api<{ ok: boolean; day: ColdCallRow }>("/api/admin/tracker/cold-calls", {
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
    queryFn: () => getColdCallSlots(calendarId, 14),
  });
}

// Books for real. Never retried: a resent POST double-books a live calendar.
export function useBookColdCall() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (input: {
      leadId: string;
      calendarId: string;
      startTime: string;
      endTime: string;
    }) => bookColdCall(input),
    onSuccess: (_res, input) => {
      qc.invalidateQueries({ queryKey: ["admin", "tracker", "leads"] });
      qc.invalidateQueries({ queryKey: ["admin", "cold-call", "slots", input.calendarId] });
    },
  });
}
