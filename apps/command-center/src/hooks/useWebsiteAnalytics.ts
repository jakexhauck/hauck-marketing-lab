import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { demoMode } from "../demo/demoMode";

// Website > Overview + Insights real numbers. Demo renders the hand-authored
// SAMPLE_* fixtures (handled in the components). A real session reads the
// client's GA4 numbers from GET /api/website/analytics; when the property or the
// service-account key is unset, the endpoint returns { connected: false } and
// the tabs keep their honest empty state.

export interface AnalyticsSource {
  label: string;
  pct: number;
}
export interface AnalyticsTopPage {
  path: string;
  label: string;
  views: number;
}
export interface WebsiteAnalytics {
  connected: boolean;
  visitorsThisMonth: number;
  visitorsLastMonth: number;
  deltaPct: number | null;
  newUsers: number;
  returningUsers: number;
  engagementRate: number;
  devices: { label: string; pct: number }[];
  cities: { label: string; visitors: number }[];
  busiestDay: string | null;
  avgTimeOnSiteSec: number;
  pageViews: number;
  topPage: AnalyticsTopPage | null;
  topPages: AnalyticsTopPage[];
  sources: AnalyticsSource[];
  trend: number[];
}

export interface UseWebsiteAnalytics {
  data: WebsiteAnalytics | null;
  loading: boolean;
  // The property is wired and returned real numbers.
  connected: boolean;
}

export function useWebsiteAnalytics(): UseWebsiteAnalytics {
  const demo = demoMode();
  const q = useQuery({
    queryKey: ["website", "analytics"],
    enabled: !demo,
    staleTime: 10 * 60_000,
    queryFn: () => api<WebsiteAnalytics>("/api/website/analytics"),
  });

  return {
    data: q.data ?? null,
    loading: !demo && q.isLoading,
    connected: !demo && Boolean(q.data?.connected),
  };
}

// Seconds -> "1m 12s" / "48s" / "0s". Shared by the Overview KPI + anywhere else
// a session duration is shown.
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}
