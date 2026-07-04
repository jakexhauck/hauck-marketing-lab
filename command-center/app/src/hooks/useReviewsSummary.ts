import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ReviewSummaryData } from "../lib/reviewsSummary";

// The Google rating hero + recent-reviews teaser on the Reviews Overview read
// their numbers through this hook. It hits /api/reviews/summary (the Google
// Places rating for the tenant's place_id). In a demo session api()
// short-circuits to DEMO_REVIEW_SUMMARY, so the return shape is identical either
// way and nothing downstream changes.
export function useReviewsSummary(enabled: boolean) {
  return useQuery({
    queryKey: ["reviews", "summary"],
    enabled,
    staleTime: 15 * 60_000,
    queryFn: () => api<ReviewSummaryData>("/api/reviews/summary"),
  });
}
