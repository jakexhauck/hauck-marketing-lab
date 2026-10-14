import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { demoMode } from "../demo/demoMode";
import type { EngagementMetric } from "../routes/website/shared";

// Website > Insights engagement numbers (estimate requests + website chats).
// Demo renders the SAMPLE_* fixtures (handled in the component). A real session
// reads the client's counts from GET /api/website/engagement; when the lead
// pipeline or token is unset, the endpoint returns { connected: false } and the
// tab keeps its honest zeros. Never a fabricated number in a real session.

export interface WebsiteEngagement {
  connected: boolean;
  estimateForm: EngagementMetric;
  chatWidget: EngagementMetric;
}

export interface UseWebsiteEngagement {
  data: WebsiteEngagement | null;
  loading: boolean;
  // The pipeline is wired and returned real counts.
  connected: boolean;
}

export function useWebsiteEngagement(): UseWebsiteEngagement {
  const demo = demoMode();
  const q = useQuery({
    queryKey: ["website", "engagement"],
    enabled: !demo,
    staleTime: 10 * 60_000,
    queryFn: () => api<WebsiteEngagement>("/api/website/engagement"),
  });

  return {
    data: q.data ?? null,
    loading: !demo && q.isLoading,
    connected: !demo && Boolean(q.data?.connected),
  };
}
