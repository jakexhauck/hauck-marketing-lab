import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type ColdSmsBudgetRow,
  type ColdSmsDailyRow,
  type ColdSmsMonthlyRow,
  type ColdSmsScriptRow,
} from "../lib/api";
import type {
  ColdSmsLead,
  ColdSmsLeadBatch,
  ColdSmsLeadFilters,
  ColdSmsLeadGroup,
} from "../lib/coldSmsLeads";

// Data hooks for the Cold SMS pages (Acquisition > Cold SMS). Agency-global admin
// data, so no tenant is threaded through any key.
//
// Cell edits use the optimistic snapshot/rollback pattern: onMutate patches the
// cached row so typing feels instant, onError puts the snapshot back, onSettled
// refetches so the server stays the final word.

const DAILY_KEY = ["admin", "tracker", "cold-sms-daily"] as const;
const MONTHLY_KEY = ["admin", "tracker", "cold-sms-monthly"] as const;
const SCRIPT_KEY = ["admin", "tracker", "cold-sms-script"] as const;

export const coldSmsKeys = {
  daily: (month: string) => [...DAILY_KEY, month],
  monthly: () => [...MONTHLY_KEY],
  script: () => [...SCRIPT_KEY],
};

interface RowsResponse<Row> {
  rows: Row[];
}

// The client speaks camelCase; the endpoints take the DB's snake_case.
const DAILY_FIELDS = {
  smsSent: "sms_sent",
  positiveReplies: "positive_replies",
  meetingsBooked: "meetings_booked",
  note: "note",
} as const;

const MONTHLY_FIELDS = {
  totalSmsSent: "total_sms_sent",
  vaCost: "va_cost",
  callsBooked: "calls_booked",
  callsShowed: "calls_showed",
  smsCost: "sms_cost",
  newClients: "new_clients",
  cashCollected: "cash_collected",
  ltv: "ltv",
} as const;

const SCRIPT_FIELDS = {
  name: "name",
  totalSent: "total_sent",
  positiveReplies: "positive_replies",
  callsBooked: "calls_booked",
  clientsClosed: "clients_closed",
} as const;

export type ColdSmsDailyField = keyof typeof DAILY_FIELDS;
export type ColdSmsMonthlyField = keyof typeof MONTHLY_FIELDS;
export type ColdSmsScriptField = keyof typeof SCRIPT_FIELDS;

// A blank cell stays blank (null), never a fabricated 0. Mirrors the server's
// coercion so the optimistic value matches what comes back.
function toCount(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toAmount(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function toText(value: string): string | null {
  const raw = value.trim();
  return raw ? raw : null;
}

/* ---------------------------------------------------------------- daily --- */

function fetchDailyMonth(month: string) {
  return api<RowsResponse<ColdSmsDailyRow>>(
    `/api/admin/tracker/cold-sms-daily?month=${encodeURIComponent(month)}`,
  );
}

// month is "YYYY-MM". Returns only the days actually logged; the surface fills
// the rest of the month from the shared month generator.
export function useColdSmsDailyQuery(month: string) {
  return useQuery({
    queryKey: coldSmsKeys.daily(month),
    queryFn: () => fetchDailyMonth(month),
  });
}

// Several months at once, for the Daily sheet, which scrolls straight through
// month ends the way the Google Sheet does. One query per month, on the same
// keys as useColdSmsDailyQuery, so the upsert's optimistic patch lands here too.
export function useColdSmsDailyRange(months: string[]) {
  return useQueries({
    queries: months.map((month) => ({
      queryKey: coldSmsKeys.daily(month),
      queryFn: () => fetchDailyMonth(month),
    })),
    combine: (results) => ({
      rows: results.flatMap((r) => r.data?.rows ?? []),
      isLoading: results.some((r) => r.isLoading),
      isError: results.some((r) => r.isError),
    }),
  });
}

interface DailyEdit {
  // "YYYY-MM" of the cached month this edit belongs to.
  month: string;
  day: string; // "YYYY-MM-DD"
  field: ColdSmsDailyField;
  value: string;
}

export function useColdSmsDailyUpsert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ day, field, value }: DailyEdit) =>
      api<{ row: ColdSmsDailyRow }>("/api/admin/tracker/cold-sms-daily", {
        method: "PATCH",
        body: JSON.stringify({ day, [DAILY_FIELDS[field]]: value }),
      }),
    onMutate: async (edit) => {
      const key = coldSmsKeys.daily(edit.month);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<RowsResponse<ColdSmsDailyRow>>(key);
      if (previous) {
        const patched =
          edit.field === "note"
            ? { note: toText(edit.value) }
            : { [edit.field]: toCount(edit.value) };
        const existing = previous.rows.some((r) => r.day === edit.day);
        const rows = existing
          ? previous.rows.map((r) => (r.day === edit.day ? { ...r, ...patched } : r))
          : [
              ...previous.rows,
              {
                // Placeholder id until the server answers with the real row.
                id: `pending-${edit.day}`,
                day: edit.day,
                smsSent: null,
                positiveReplies: null,
                meetingsBooked: null,
                note: null,
                ...patched,
              } as ColdSmsDailyRow,
            ];
        qc.setQueryData<RowsResponse<ColdSmsDailyRow>>(key, { rows });
      }
      return { key, previous };
    },
    onError: (_err, _edit, context) => {
      if (context?.previous) qc.setQueryData(context.key, context.previous);
    },
    onSettled: (_data, _err, edit) => {
      qc.invalidateQueries({ queryKey: coldSmsKeys.daily(edit.month) });
    },
  });
}

/* -------------------------------------------------------------- monthly --- */

export function useColdSmsMonthlyQuery() {
  return useQuery({
    queryKey: coldSmsKeys.monthly(),
    queryFn: () => api<RowsResponse<ColdSmsMonthlyRow>>("/api/admin/tracker/cold-sms-monthly"),
  });
}

interface MonthlyEdit {
  month: string; // "YYYY-MM" or "YYYY-MM-DD"; normalized server-side.
  field?: ColdSmsMonthlyField;
  value?: string;
}

// Also the "add a month" path: PATCH with no field creates the empty row.
export function useColdSmsMonthlyUpsert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ month, field, value }: MonthlyEdit) =>
      api<{ row: ColdSmsMonthlyRow }>("/api/admin/tracker/cold-sms-monthly", {
        method: "PATCH",
        body: JSON.stringify(
          field ? { month, [MONTHLY_FIELDS[field]]: value ?? "" } : { month },
        ),
      }),
    onMutate: async (edit) => {
      const key = coldSmsKeys.monthly();
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<RowsResponse<ColdSmsMonthlyRow>>(key);
      if (previous && edit.field) {
        const field = edit.field;
        const next =
          field === "vaCost" ||
          field === "smsCost" ||
          field === "cashCollected" ||
          field === "ltv"
            ? toAmount(edit.value ?? "")
            : toCount(edit.value ?? "");
        const rows = previous.rows.map((r) =>
          r.month.startsWith(edit.month.slice(0, 7)) ? { ...r, [field]: next } : r,
        );
        qc.setQueryData<RowsResponse<ColdSmsMonthlyRow>>(key, { rows });
      }
      return { key, previous };
    },
    onError: (_err, _edit, context) => {
      if (context?.previous) qc.setQueryData(context.key, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: coldSmsKeys.monthly() });
    },
  });
}

/* --------------------------------------------------------------- script --- */

export function useColdSmsScriptQuery() {
  return useQuery({
    queryKey: coldSmsKeys.script(),
    queryFn: () => api<RowsResponse<ColdSmsScriptRow>>("/api/admin/tracker/cold-sms-script"),
  });
}

export function useColdSmsScriptCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<{ row: ColdSmsScriptRow }>("/api/admin/tracker/cold-sms-script", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coldSmsKeys.script() });
    },
  });
}

interface ScriptEdit {
  id: string;
  field: ColdSmsScriptField;
  value: string;
}

export function useColdSmsScriptUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, field, value }: ScriptEdit) =>
      api<{ row: ColdSmsScriptRow }>("/api/admin/tracker/cold-sms-script", {
        method: "PATCH",
        body: JSON.stringify({ id, [SCRIPT_FIELDS[field]]: value }),
      }),
    onMutate: async (edit) => {
      const key = coldSmsKeys.script();
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<RowsResponse<ColdSmsScriptRow>>(key);
      if (previous) {
        const patched =
          edit.field === "name"
            ? { name: edit.value }
            : { [edit.field]: toCount(edit.value) };
        const rows = previous.rows.map((r) => (r.id === edit.id ? { ...r, ...patched } : r));
        qc.setQueryData<RowsResponse<ColdSmsScriptRow>>(key, { rows });
      }
      return { key, previous };
    },
    onError: (_err, _edit, context) => {
      if (context?.previous) qc.setQueryData(context.key, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: coldSmsKeys.script() });
    },
  });
}

export function useColdSmsScriptDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: boolean }>(
        `/api/admin/tracker/cold-sms-script?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      ),
    onMutate: async (id) => {
      const key = coldSmsKeys.script();
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<RowsResponse<ColdSmsScriptRow>>(key);
      if (previous) {
        qc.setQueryData<RowsResponse<ColdSmsScriptRow>>(key, {
          rows: previous.rows.filter((r) => r.id !== id),
        });
      }
      return { key, previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) qc.setQueryData(context.key, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: coldSmsKeys.script() });
    },
  });
}

/* --------------------------------------------------------------- budget --- */

const BUDGET_KEY = ["admin", "tracker", "cold-sms-budget"] as const;

export function useColdSmsBudgetQuery() {
  return useQuery({
    queryKey: BUDGET_KEY,
    queryFn: () => api<RowsResponse<ColdSmsBudgetRow>>("/api/admin/tracker/cold-sms-budget"),
  });
}

// Writes one month whole. The page holds the month in local state while it is
// open, so the cache is only refreshed, never patched optimistically.
export function useColdSmsBudgetSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (row: Omit<ColdSmsBudgetRow, "id">) =>
      api<{ row: ColdSmsBudgetRow }>("/api/admin/tracker/cold-sms-budget", {
        method: "PUT",
        body: JSON.stringify(row),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: BUDGET_KEY });
    },
  });
}

/* ---------------------------------------------------------------- leads --- */

const LEADS_KEY = ["admin", "tracker", "cold-sms-leads"] as const;

export const coldSmsLeadKeys = {
  all: () => [...LEADS_KEY],
  groups: () => [...LEADS_KEY, "groups"],
  preview: (filters: ColdSmsLeadFilters) => [...LEADS_KEY, "preview", filters],
};

// Every available city x line type x service count, and every past download.
export function useColdSmsLeadGroups() {
  return useQuery({
    queryKey: coldSmsLeadKeys.groups(),
    queryFn: () =>
      api<{ groups: ColdSmsLeadGroup[]; batches: ColdSmsLeadBatch[] }>(
        "/api/admin/tracker/cold-sms-leads",
      ),
  });
}

// The first leads a download with these filters would take (at most 100).
export function useColdSmsLeadPreview(filters: ColdSmsLeadFilters) {
  return useQuery({
    queryKey: coldSmsLeadKeys.preview(filters),
    queryFn: () =>
      api<{ rows: ColdSmsLead[] }>("/api/admin/tracker/cold-sms-leads", {
        method: "POST",
        body: JSON.stringify(filters),
      }),
    placeholderData: (previous) => previous,
  });
}
