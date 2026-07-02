import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { normalizeAdsInsights, type AdsInsightsResponse } from "../lib/adsInsights";

// The Paid Ads tabs (Overview / Insights / Creatives) all read Meta insights
// through this one hook: /api/ads/insights in a real session, the demo payload
// in a demo session. `configured` is false when the Meta account isn't wired
// yet (tabs show not-connected); configured with zeros means ads simply haven't
// run.
export function useAdsInsights(enabled: boolean) {
  return useQuery({
    queryKey: ["ads", "insights"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      normalizeAdsInsights(await api<AdsInsightsResponse>("/api/ads/insights")),
  });
}
