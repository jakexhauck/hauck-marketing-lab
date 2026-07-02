import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { demoMode } from "../demo/demoMode";
import {
  buildPaidAdsLeads,
  DEMO_LEADS,
  type PaidAdsDataset,
} from "../lib/paidAdsPipeline";

// The Paid Ads (Sales) surface reads its worklist through this hook so the page
// stays source-agnostic. Demo/preview returns the hand-authored worklist
// instantly; a real session fetches the live Paid Ad's Pipeline opportunities
// from GET /api/ads/leads and maps them to the same shape.
export function usePaidAdsLeads(): PaidAdsDataset {
  const demo = demoMode();
  const { data } = useQuery({
    queryKey: ["ads-leads"],
    enabled: !demo,
    staleTime: 30_000,
    queryFn: () => api<{ leads: unknown[] }>("/api/ads/leads"),
  });
  const raw = demo ? DEMO_LEADS : data?.leads;
  return useMemo(() => buildPaidAdsLeads(demo, raw), [demo, raw]);
}
