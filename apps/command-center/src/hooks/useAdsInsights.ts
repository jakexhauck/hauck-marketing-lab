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
    queryFn: () => api<AdsInsightsResponse>("/api/ads/insights"),
    // Normalize on READ, not just on fetch. `select` runs over whatever data the
    // query returns, INCLUDING a rehydrated persisted-cache entry, so an old
    // partial payload (e.g. a bare `{ configured: false }` with no `totals`)
    // written by a previous bundle is coerced to the full shape before any
    // component reads it. Normalizing only inside `queryFn` misses that path and
    // let the Paid Ads tabs white-screen off the stale cache.
    select: normalizeAdsInsights,
  });
}
