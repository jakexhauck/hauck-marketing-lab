import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { BudgetItem, RecurringItem } from "../lib/agencyBudget";

// Operations > Budget (0144). One row per month, written whole.

export interface AgencyBudgetRow {
  id: string;
  // YYYY-MM-01
  month: string;
  items: BudgetItem[];
}

const KEY = ["admin", "budget"] as const;

export function useAgencyBudgetQuery() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<{ rows: AgencyBudgetRow[] }>("/api/admin/budget"),
  });
}

export interface SmsCost {
  month: string;
  texts: { outCount: number; outSegments: number; inCount: number; inSegments: number; cost: number };
  fixed: number;
  // null = Twilio not connected.
  lookup: { count: number; cost: number } | null;
  total: number;
  pendingDays: number;
  error: string | null;
}

// The automatic cold SMS cost. The server syncs a bounded slice of days per
// call, so while days are pending the query polls until the month is whole.
export function useSmsCostQuery(month: string) {
  return useQuery({
    queryKey: ["admin", "sms-cost", month],
    queryFn: () => api<SmsCost>(`/api/admin/sms-cost?month=${month}`),
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && d.pendingDays > 0 && !d.error ? 1500 : false;
    },
  });
}

// The page holds the open month in local state, so the cache is only
// refreshed after a write, never patched optimistically.
export function useAgencyBudgetSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (row: Omit<AgencyBudgetRow, "id">) =>
      api<{ row: AgencyBudgetRow }>("/api/admin/budget", {
        method: "PUT",
        body: JSON.stringify(row),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

const RECURRING_KEY = ["admin", "budget-recurring"] as const;

export function useRecurringQuery() {
  return useQuery({
    queryKey: RECURRING_KEY,
    queryFn: () => api<{ items: RecurringItem[] }>("/api/admin/budget-recurring"),
  });
}

// Writes the list whole. The page holds it in local state, so the cache is
// only refreshed after a write.
export function useRecurringSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: RecurringItem[]) =>
      api<{ items: RecurringItem[] }>("/api/admin/budget-recurring", {
        method: "PUT",
        body: JSON.stringify({ items }),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: RECURRING_KEY });
    },
  });
}
