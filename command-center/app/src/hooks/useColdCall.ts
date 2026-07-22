import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ColdCallRow } from "../lib/api";
import { isColdCallNumericField, type ColdCallField } from "../lib/coldCall";

// Cold Call tracker data (Acquisition > Cold Call). Kept out of useApi.ts: this
// surface owns its own month-scoped cache and an optimistic per-cell save, and
// the shared hooks file is already large.

export interface ColdCallsResponse {
  days: ColdCallRow[];
}

// One cache entry per viewed month.
function monthKey(month: string) {
  return ["admin", "tracker", "cold-calls", month];
}

// `month` is "YYYY-MM". Rows come back sparse: only days that were logged.
export function useColdCallsQuery(month: string) {
  return useQuery({
    queryKey: monthKey(month),
    staleTime: 30_000,
    queryFn: () =>
      api<ColdCallsResponse>(`/api/admin/tracker/cold-calls?month=${month}`),
  });
}

export interface SaveColdCallInput {
  day: string; // "YYYY-MM-DD"
  field: ColdCallField;
  value: string;
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
        }),
      }),
    onMutate: async (input) => {
      const month = input.day.slice(0, 7);
      const key = monthKey(month);
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
      qc.invalidateQueries({ queryKey: monthKey(input.day.slice(0, 7)) });
    },
  });
}
