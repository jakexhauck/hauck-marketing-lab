import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ReviewFunnelData } from "../lib/reviewsFunnel";

// The Google Reviews Overview funnel reads its rolled-up counts through this
// hook. It hits /api/reviews/funnel (the Google Reviews pipeline, resolved by
// name). In a demo session api() short-circuits to DEMO_REVIEW_FUNNEL, so the
// return shape is identical either way and nothing downstream changes.
export function useReviewsFunnel(enabled: boolean) {
  return useQuery({
    queryKey: ["reviews", "funnel"],
    enabled,
    staleTime: 60_000,
    queryFn: () => api<ReviewFunnelData>("/api/reviews/funnel"),
  });
}
