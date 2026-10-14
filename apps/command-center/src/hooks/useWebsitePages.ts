import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { demoMode } from "../demo/demoMode";

// Website > Pages data. Demo renders the hand-authored SITE_PAGES (handled in
// the component). A real session reads the client's page list (the manual
// per-client list the agency maintains) via GET /api/website/pages; the
// component joins each path onto the tenant's website_url to preview and open it.

export interface WebsitePageItem {
  id: string;
  name: string;
  path: string;
}

export interface WebsiteSite {
  name: string;
  updatedAt: string | null;
}

export interface UseWebsitePages {
  site: WebsiteSite | null;
  pages: WebsitePageItem[];
  loading: boolean;
  // Legacy flag from the old GHL-backed endpoint; the manual list never sets it
  // (an empty list just shows the "your pages will live here" state).
  unavailable: boolean;
}

export function useWebsitePages(): UseWebsitePages {
  const demo = demoMode();
  const q = useQuery({
    queryKey: ["website", "pages"],
    enabled: !demo,
    staleTime: 5 * 60_000,
    queryFn: () =>
      api<{
        site: WebsiteSite | null;
        pages: WebsitePageItem[];
        unavailable?: boolean;
      }>("/api/website/pages"),
  });

  return {
    site: q.data?.site ?? null,
    pages: q.data?.pages ?? [],
    loading: !demo && q.isLoading,
    unavailable: !demo && Boolean(q.data?.unavailable),
  };
}
