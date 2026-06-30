import { useMemo } from "react";
import { demoMode } from "../demo/demoMode";
import { buildPaidAdsLeads, type PaidAdsDataset } from "../lib/paidAdsPipeline";

// The Paid Ads (Sales) surface reads its worklist through this hook so the page
// stays source-agnostic. Today it returns a hand-authored demo worklist in
// demo/preview mode and an empty set in a real session (no GoHighLevel feed yet).
// When the live source lands, swap the body for a query against the Paid Ad's
// Pipeline (e.g. `useQuery(["paid-ads-leads"], () => api("/api/ads/leads"))`)
// and keep the return shape: nothing downstream changes.
export function usePaidAdsLeads(): PaidAdsDataset {
  const demo = demoMode();
  return useMemo(() => buildPaidAdsLeads(demo), [demo]);
}
