import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { demoMode } from "../demo/demoMode";
import { buildLeadsHub, DEMO_LEADS, type LeadsHubDataset } from "../lib/leadsHub";

// The merged Leads surface reads its worklist through this hook so the page stays
// source-agnostic. Demo/preview returns the hand-authored worklist instantly; a
// real session fetches the live merged Paid + Organic leads from
// GET /api/sales/leads and maps them to the same shape.
export function useLeadsHub(): LeadsHubDataset {
  const demo = demoMode();
  const { data } = useQuery({
    queryKey: ["sales-leads"],
    enabled: !demo,
    staleTime: 30_000,
    queryFn: () => api<{ leads: unknown[] }>("/api/sales/leads"),
  });
  const raw = demo ? DEMO_LEADS : data?.leads;
  return useMemo(() => buildLeadsHub(demo, raw), [demo, raw]);
}
