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

// Just these prospects, by id.
//
// For the Power dialer, which wants the two or three people the phone has been
// on and nothing else. It used to read the whole book and throw all but a
// handful of it away; at 746 leads that request stopped completing at all,
// because Cloudflare killed the Worker for exceeding its CPU budget before the
// handler could answer. The page reported that as "Could not load the book",
// which was true and told nobody why.
//
// The key sits UNDER the book's key on purpose. React Query matches by prefix,
// so every invalidateQueries(KEY) the mutations below already fire refreshes
// this too, and nothing has to remember it exists.
export function useAdminLeadsByIds(ids: string[]) {
  // Sorted so the same set of prospects is the same cache entry whatever order
  // the calls came back in.
  const key = [...ids].sort().join(",");
  return useQuery({
    queryKey: [...KEY, "by-ids", key],
    // Nobody on the phone is not an error and not a loading state. Asking for
    // no ids would also be a pointless round trip.
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: () => api<LeadsResponse>(`${PATH}?ids=${encodeURIComponent(key)}`),
  });
}

// What a sync did, in the words the section reports it with.
export interface LeadSyncResult {
  // False when the agency GoHighLevel account is not connected at all.
  configured: boolean;
  // True when it is connected but no board resembles the cold calling one.
  noPipeline?: boolean;
  pipeline?: string;
  added: number;
  leads: AdminLead[];
  skippedExisting?: number;
  skippedNoPhone?: number;
  // Stages GoHighLevel has that the console has no page for.
  skippedStages?: string[];
}

// Pull anything the board has and the book does not.
//
// A mutation rather than a query because it writes, but it is safe to fire
// unprompted: the server matches on GHL contact id and phone number, so a
// second run adds nothing. That is what lets the section call it on open, which
// is the difference between leads that populate and leads somebody has to
// remember to go and fetch.
export function useSyncAdminLeadsFromGhl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<LeadSyncResult>(`${PATH}/sync-ghl`, { method: "POST" }),
    onSuccess: (result) => {
      // Only disturb the list when the sync actually changed it.
      if (result.added > 0) qc.invalidateQueries({ queryKey: KEY });
    },
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
      // Add writes the book's own cache only: a brand new row belongs to no
      // by-ids subset, because nothing has called that prospect yet.
      if (context?.previous) qc.setQueryData(KEY, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY });
      // Agreeing (or moving, or clearing) a callback changes which times are
      // spoken for. Without this the picker keeps offering a slot that was taken
      // thirty seconds ago, which is the whole thing it exists to prevent.
      qc.invalidateQueries({ queryKey: ["admin", "cold-call", "callback-slots"] });
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
      // setQueriesData, not setQueryData: the Power dialer reads a by-ids
      // subset under this same key prefix, and an edit made on its card has to
      // land in the cache actually being rendered.
      const previous = qc.getQueriesData<LeadsResponse>({ queryKey: KEY });
      qc.setQueriesData<LeadsResponse>({ queryKey: KEY }, (old) =>
        old
          ? { leads: old.leads.map((l) => (l.id === input.id ? { ...l, ...input } : l)) }
          : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.previous ?? []) qc.setQueryData(key, data);
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
      const previous = qc.getQueriesData<LeadsResponse>({ queryKey: KEY });
      qc.setQueriesData<LeadsResponse>({ queryKey: KEY }, (old) =>
        old ? { leads: old.leads.filter((l) => l.id !== input.id) } : old,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.previous ?? []) qc.setQueryData(key, data);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
