import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { BudgetItem } from "../lib/agencyBudget";

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
