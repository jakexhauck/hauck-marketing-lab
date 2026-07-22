import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type AdminLead } from "../lib/api";
import { blankLeadDraft } from "../lib/adminLeads";

// Data layer for the Acquisition > Leads surface. Kept in its own module rather
// than useApi.ts: this is admin-only agency data with a self-contained CRUD
// shape, and every mutation below is optimistic so a spreadsheet cell settles
// the moment you leave it.
//
// One key backs the whole surface, since the tiles, the filter and the sort all
// read the same list client-side.

const PATH = "/api/admin/tracker/leads";
const KEY = ["admin", "tracker", "leads"] as const;

interface LeadsResponse {
  leads: AdminLead[];
}

// The fields a write may carry. Mirrors the server whitelist in
// functions/api/admin/tracker/leads.ts.
export type AdminLeadFields = Partial<Omit<AdminLead, "id" | "createdAt">>;

export function useAdminLeadsQuery(enabled = true) {
  return useQuery({
    queryKey: KEY,
    enabled,
    staleTime: 30_000,
    queryFn: () => api<LeadsResponse>(PATH),
  });
}

// Add a row. The blank draft lands at the top of the list straight away (the
// list is newest first) and is swapped for the saved row when the POST returns.
export function useAddAdminLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fields: AdminLeadFields = {}) =>
      api<{ lead: AdminLead }>(PATH, { method: "POST", body: JSON.stringify(fields) }),
    onMutate: async (fields) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<LeadsResponse>(KEY);
      const tempId = `temp-${Date.now()}`;
      if (previous) {
        const draft = { ...blankLeadDraft(tempId), ...fields };
        qc.setQueryData<LeadsResponse>(KEY, { leads: [draft, ...previous.leads] });
      }
      return { previous, tempId };
    },
    onSuccess: (data, _vars, context) => {
      const current = qc.getQueryData<LeadsResponse>(KEY);
      if (!current || !context) return;
      qc.setQueryData<LeadsResponse>(KEY, {
        leads: current.leads.map((l) => (l.id === context.tempId ? data.lead : l)),
      });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(KEY, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

// Edit one row. Backs both the inline cell edits and the status pill.
export function useUpdateAdminLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string } & AdminLeadFields) =>
      api<{ lead: AdminLead }>(PATH, { method: "PATCH", body: JSON.stringify(input) }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<LeadsResponse>(KEY);
      if (previous) {
        qc.setQueryData<LeadsResponse>(KEY, {
          leads: previous.leads.map((l) => (l.id === input.id ? { ...l, ...input } : l)),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(KEY, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

// Soft delete. The row leaves every list; it stays in the table with
// deleted_at set.
export function useDeleteAdminLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string }) =>
      api<{ ok: true }>(PATH, { method: "DELETE", body: JSON.stringify(input) }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<LeadsResponse>(KEY);
      if (previous) {
        qc.setQueryData<LeadsResponse>(KEY, {
          leads: previous.leads.filter((l) => l.id !== input.id),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(KEY, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
