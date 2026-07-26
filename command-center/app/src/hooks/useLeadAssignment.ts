import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ImportLead } from "../lib/csvLeads";

// Handing work out: who can be given leads, importing a list, and assigning a
// selection to somebody. Owner-only endpoints, so these hooks are only ever
// mounted on the owner's view of the Leads page.

const LEADS_KEY = ["admin", "tracker", "leads"] as const;

export interface TeamMemberSummary {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

// The people a lead can be assigned to. Reuses the Team roster and filters to
// active cold callers plus the owner, since a setter works a client's leads in
// the Setter Suite rather than the agency book.
export function useAssignableCallersQuery(enabled = true) {
  return useQuery({
    queryKey: ["admin", "team", "assignable"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api<{ team: TeamMemberSummary[] }>("/api/admin/team");
      return (res.team ?? []).filter(
        (m) => m.status === "active" && (m.role === "cold_caller" || m.role === "owner"),
      );
    },
  });
}

export interface ImportResult {
  // How many of the imported rows made it into GoHighLevel tagged `cc new lead`.
  pushed?: number;
  pushFailed?: number;
  // The agency GHL account is not connected, so nothing was pushed at all.
  notConfigured?: boolean;
  imported: number;
  skippedNoPhone: number;
  skippedDuplicate: number;
}

export function useImportLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { rows: ImportLead[]; assignedTo: string | null }) =>
      api<ImportResult>("/api/admin/tracker/leads/import", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LEADS_KEY });
    },
  });
}

export function useAssignLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: string[]; assignedTo: string | null }) =>
      api<{ updated: number }>("/api/admin/tracker/leads/assign", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LEADS_KEY });
    },
  });
}
