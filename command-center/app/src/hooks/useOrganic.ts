import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { demoMode } from "../demo/demoMode";
import type { OrganicDataset, OrganicDetail } from "../lib/organic";

// The Organic page's data. Three queries, deliberately separate:
//
//   useOrganicAvailable  the nav asks this on every page to decide whether the
//                        Organic row exists at all. It must be CHEAP, so it hits
//                        ?probe=1 (one GHL pipelines call, no opportunities) and
//                        is cached for the session. A client whose website we do
//                        not manage has no Organic pipeline and never sees the row.
//
//   useOrganicLeads      the page's list.
//
//   useOrganicDetail     what one lead said, fetched only when a row is opened.
//                        This is the expensive one (contact + thread + field
//                        defs), which is exactly why it is not on the list.

export function useOrganicAvailable(enabled: boolean): boolean {
  const demo = demoMode();
  const { data } = useQuery({
    queryKey: ["organic-available"],
    enabled: enabled && !demo,
    // The pipeline set changes when Jake builds one, not while somebody browses.
    staleTime: Infinity,
    queryFn: () => api<{ available: boolean }>("/api/organic?probe=1"),
  });
  if (demo) return true;
  // Hidden until proven available: a row that appears and then vanishes on every
  // page load is worse than one that arrives a beat late.
  return data?.available ?? false;
}

export function useOrganicLeads() {
  const demo = demoMode();
  return useQuery({
    queryKey: ["organic-leads"],
    enabled: !demo,
    staleTime: 30_000,
    queryFn: () => api<OrganicDataset>("/api/organic"),
  });
}

export function useOrganicDetail(contactId: string | null) {
  return useQuery({
    queryKey: ["organic-detail", contactId],
    enabled: Boolean(contactId),
    staleTime: 60_000,
    queryFn: () => api<OrganicDetail>(`/api/organic/${encodeURIComponent(contactId as string)}`),
  });
}
